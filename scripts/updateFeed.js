/**
 * /scripts/updateFeed.js
 * TinmanApps Adaptive Feed Engine v8.0
 * “Render-Safe • Deterministic • New-First + Lastmod Priority • No Hidden Deps”
 * ───────────────────────────────────────────────────────────────────────────────
 * ✅ 100% Render-safe (no headless Chrome)
 * ✅ Discovers products from AppSumo XML sitemaps (captures <lastmod>)
 * ✅ Fetches product pages; extracts OG:title / OG:image / meta:description
 * ✅ Deterministic category classifier (no external semantic module required)
 * ✅ Normalizes (feedNormalizer v3.1) → Enriches (ctaEngine v6.4) per item’s own category
 * ✅ Preserves historical CTAs/subtitles; archives missing
 * ✅ Strict MAX_PER_CATEGORY on ACTIVE items (overflow archived backlog)
 * ✅ New-first selection (prefer unseen) + lastmod recency priority
 * ✅ Tracks firstSeenAt / lastSeenAt / lastmodAt for each deal
 * ✅ Referral integrity: masked redirects via /api/track; images via /api/image-proxy
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import crypto from "crypto";

import { createCtaEngine, enrichDeals } from "../lib/ctaEngine.js";
import { normalizeFeed } from "../lib/feedNormalizer.js";

// ───────────────────────────────────────────────────────────────────────────────
// Paths & constants
// ───────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u="; // masked affiliate base

// Tuning
const MAX_PER_CATEGORY = 10;          // set to Infinity to show all
const DETAIL_CONCURRENCY = 8;         // HTTP concurrency
const PRODUCT_URL_HARD_CAP = 800;     // safety guard
const HTTP_TIMEOUT_MS = 12000;        // per-request guard
const RETRIES = 2;                    // network retry attempts

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function writeJson(file, data) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}
function readJsonSafe(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function dedupe(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const i of items) {
    const k = keyFn ? keyFn(i) : sha1(i.url || i.slug || i.title);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(i);
    }
  }
  return out;
}

async function fetchText(url, tries = RETRIES) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "TinmanApps/UpdateFeed v8.0 (Render-safe XML crawler; contact: admin@tinmanapps.com)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.text();
  } catch (e) {
    if (tries > 0) {
      await new Promise((r) => setTimeout(r, 400 * (RETRIES - tries + 1)));
      return fetchText(url, tries - 1);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function toSlug(url) {
  const m =
    url?.match(/\/products\/([^/]+)\/?$/i) ||
    url?.match(/\/products\/([^/]+)\//i);
  return m ? m[1] : null;
}

function extractMeta(html, name) {
  // supports property= / name=
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  return html.match(re)?.[1] || null;
}

function extractOg(html) {
  const title =
    extractMeta(html, "og:title") ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1] ||
    null;
  const image =
    extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || null;
  const desc =
    extractMeta(html, "og:description") ||
    extractMeta(html, "description") ||
    null;
  return { title, image, description: desc };
}

function proxied(src) {
  return `${SITE_ORIGIN}/api/image-proxy?src=${encodeURIComponent(src)}`;
}

function tracked({ slug, cat, url }) {
  const masked = REF_PREFIX + encodeURIComponent(url);
  return `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(
    slug
  )}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(masked)}`;
}

function normalizeEntry({ slug, title, url, cat, image, description, lastmod }) {
  const safeSlug =
    slug ||
    toSlug(url) ||
    (title || "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
  return {
    title: title || (safeSlug || "Untitled"),
    slug: safeSlug || "untitled",
    category: cat,
    url, // raw product url (normalizeFeed will map to link/referral later)
    referralUrl: tracked({ slug: safeSlug || "untitled", cat, url }),
    image: image ? proxied(image) : `${SITE_ORIGIN}/assets/placeholder.webp`,
    description: description || null,
    lastmodAt: lastmod ? new Date(lastmod).toISOString() : null, // carry sitemap lastmod
  };
}

async function withConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let index = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      try {
        out[i] = await worker(items[i], i);
      } catch (err) {
        console.warn(`⚠️ Worker failed @ ${i}: ${err.message}`);
      }
    }
  });
  await Promise.all(runners);
  return out.filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────────
// Deterministic category classifier (no external semanticCluster module)
// ───────────────────────────────────────────────────────────────────────────────
function classify(title, url) {
  const t = String(title || "").toLowerCase();
  const u = String(url || "").toLowerCase();

  // Strong title signals
  if (/\b(ai|chatgpt|gpt|machine learning|ml|nlp|stable diffusion)\b/i.test(title)) return "ai";
  if (/\b(course|academy|bootcamp|lesson|tutorial|training|masterclass)\b/i.test(title)) return "courses";
  if (/\b(marketing|seo|campaign|newsletter|social|advert|affiliate|influencer)\b/i.test(title)) return "marketing";
  if (/\b(task|kanban|todo|calendar|pomodoro|productivity|habit|meeting)\b/i.test(title)) return "productivity";
  if (/\b(woocommerce|shopify|checkout|cart|store|ecommerce|upsell)\b/i.test(title)) return "ecommerce";
  if (/\b(brand|design|graphic|video|image|creative|studio|art|logo)\b/i.test(title)) return "creative";
  if (/\b(website|wordpress|landing|builder|webflow|frontend|page builder|ui|ux)\b/i.test(title)) return "web";
  if (/\b(crm|invoice|accounting|clients|agency|operations|analytics|finance)\b/i.test(title)) return "business";

  // URL nudges (defensive)
  if (/\/courses?\b|academy|tutorial|training/i.test(u)) return "courses";
  if (/\/marketing|crm|leads|campaign/i.test(u)) return "marketing";
  if (/\/productivity|task|kanban|calendar/i.test(u)) return "productivity";
  if (/\/web|wordpress|landing|builder/i.test(u)) return "web";
  if (/\/shop|store|checkout|cart|ecommerce/i.test(u)) return "ecommerce";
  if (/\/creative|design|brand|media|graphic/i.test(u)) return "creative";
  if (/\/ai|gpt|machine-?learning|ml|nlp/i.test(u)) return "ai";
  if (/\/agency|client|invoice|accounting|analytics|finance/i.test(u)) return "business";

  return "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// Sitemap discovery (captures <lastmod>)
// Returns: Array<{ url, lastmod }>
// ───────────────────────────────────────────────────────────────────────────────
function canonicalize(u) {
  try {
    const s = new URL(u);
    // keep only canonical product pages
    if (!/\/products\/[^/]+\/?$/i.test(s.pathname)) return null;
    s.pathname = s.pathname.replace(/\/+$/, "/");
    return s.toString();
  } catch {
    return null;
  }
}

async function parseSitemapAt(url) {
  try {
    const xml = await fetchText(url);
    const parsed = await parseStringPromise(xml);
    return parsed;
  } catch {
    return null;
  }
}

function collectFromUrlset(urlset) {
  const out = [];
  const rows = urlset?.url || [];
  for (const row of rows) {
    const loc = row.loc?.[0];
    const lm = row.lastmod?.[0];
    const canon = canonicalize(loc);
    if (canon) out.push({ url: canon, lastmod: lm || null });
  }
  return out;
}

async function discoverProductUrls() {
  const seen = new Map(); // url -> lastmod (max)
  const seed = [
    "https://appsumo.com/sitemap.xml",
    "https://appsumo.com/sitemap_index.xml",
    "https://appsumo.com/sitemap-products.xml",
    "https://appsumo.com/sitemap-products1.xml",
    "https://appsumo.com/sitemap_products.xml",
  ];

  const queue = [...seed];
  const visited = new Set();

  while (queue.length && seen.size < PRODUCT_URL_HARD_CAP) {
    const next = queue.shift();
    if (!next || visited.has(next)) continue;
    visited.add(next);

    const doc = await parseSitemapAt(next);
    if (!doc) continue;

    // urlset → collect product URLs
    if (doc.urlset) {
      for (const { url, lastmod } of collectFromUrlset(doc.urlset)) {
        if (seen.size >= PRODUCT_URL_HARD_CAP) break;
        const prev = seen.get(url);
        if (!prev || (lastmod && new Date(lastmod) > new Date(prev))) {
          seen.set(url, lastmod || prev || null);
        }
      }
    }

    // sitemapindex → enqueue children
    const subs = doc.sitemapindex?.sitemap || [];
    for (const sm of subs) {
      const loc = sm.loc?.[0];
      if (loc && !visited.has(loc)) queue.push(loc);
    }
  }

  // Fallback: scrape /software/ if nothing found
  if (seen.size === 0) {
    try {
      const html = await fetchText("https://appsumo.com/software/");
      const matches = Array.from(
        html.matchAll(/href=["'](https?:\/\/[^"']*\/products\/[^"']*\/?)["']/gi)
      ).map((m) => canonicalize(m[1]));
      for (const u of matches) {
        if (!u) continue;
        if (seen.size >= PRODUCT_URL_HARD_CAP) break;
        if (!seen.has(u)) seen.set(u, null);
      }
    } catch {
      // ignore
    }
  }

  const list = Array.from(seen.entries()).map(([url, lastmod]) => ({ url, lastmod }));
  console.log(`🧭 Discovered ${list.length} product URLs`);
  return list.slice(0, PRODUCT_URL_HARD_CAP);
}

// ───────────────────────────────────────────────────────────────────────────────
// Detail fetch (Render-safe; retries; OG + description)
// input: { url, lastmod }
// ───────────────────────────────────────────────────────────────────────────────
async function fetchDetail(entry) {
  const { url, lastmod } = entry;
  const slug = toSlug(url);
  try {
    const html = await fetchText(url);
    const og = extractOg(html);

    const titleClean = (og.title || "").split(/\s*[-–—]\s*/)[0].trim();
    const cat = classify(titleClean || og.title || "", url);

    return normalizeEntry({
      slug,
      title: titleClean || slug?.replace(/[-_]/g, " ") || "Untitled",
      url,
      cat,
      image: og.image,
      description: og.description,
      lastmod,
    });
  } catch {
    // Fallback with minimal info
    return normalizeEntry({
      slug,
      title: (slug || "").replace(/[-_]/g, " ") || "Untitled",
      url,
      cat: classify(slug || "", url),
      image: null,
      description: null,
      lastmod,
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Active-cap merge: NEW-FIRST + LASTMOD priority + history preservation
// - Preserves SEO (cta/subtitle)
// - Adds firstSeenAt / lastSeenAt / lastmodAt
// - Strict cap on ACTIVE items; overflow archived (backlog)
// ───────────────────────────────────────────────────────────────────────────────
function mergeWithHistoryActiveCap(cat, fresh, cap) {
  const nowISO = new Date().toISOString();
  const file = `appsumo-${cat}.json`;
  const existing = readJsonSafe(file, []);
  const prevBySlug = new Map(existing.map((x) => [x.slug, x]));

  const newItems = [];
  const knownItems = [];

  for (const item of fresh) {
    if (prevBySlug.has(item.slug)) knownItems.push(item);
    else newItems.push(item);
  }

  const sortByRecency = (a, b) => {
    const la = a.lastmodAt ? Date.parse(a.lastmodAt) : 0;
    const lb = b.lastmodAt ? Date.parse(b.lastmodAt) : 0;
    if (lb !== la) return lb - la;
    return String(a.title || a.slug).localeCompare(String(b.title || b.slug));
  };
  newItems.sort(sortByRecency);
  knownItems.sort(sortByRecency);

  const ordered = [...newItems, ...knownItems];

  const activeSet = new Set(
    (Number.isFinite(cap) ? ordered.slice(0, cap) : ordered).map((x) => x.slug)
  );

  const merged = [];

  // Update/insert fresh
  for (const item of fresh) {
    const prev = prevBySlug.get(item.slug);
    const preservedSeo = prev?.seo || {};
    const firstSeenAt = prev?.firstSeenAt || nowISO;
    const lastSeenAt = nowISO;

    const updated = {
      ...item,
      seo: {
        cta: item.seo?.cta || preservedSeo.cta || null,
        subtitle: item.seo?.subtitle || preservedSeo.subtitle || null,
      },
      firstSeenAt,
      lastSeenAt,
      lastmodAt: item.lastmodAt || prev?.lastmodAt || null,
      archived: !activeSet.has(item.slug),
    };
    merged.push(updated);
  }

  // Carry over missing → archived
  for (const prev of existing) {
    if (!fresh.find((x) => x.slug === prev.slug)) {
      merged.push({
        ...prev,
        archived: true,
        lastSeenAt: prev.lastSeenAt || nowISO,
      });
    }
  }

  return merged;
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  ensureDir(DATA_DIR);

  // Initialize CTA engine (ensures deterministic template pools loaded)
  createCtaEngine();
  console.log("✅ CTA Engine ready");

  console.log("⏳ Discovering AppSumo products…");
  const discovered = await discoverProductUrls();

  // If discovery fails entirely, do not clobber existing category files
  if (!discovered.length) {
    console.warn("⚠️ No product URLs discovered — keeping existing category silos untouched.");
    console.log("✨ UpdateFeed v8.0 completed (no-op due to zero discovery).");
    return;
  }

  // Fetch details in parallel
  const details = await withConcurrency(discovered, DETAIL_CONCURRENCY, fetchDetail);

  // Deduplicate by canonical URL (keeps most recent lastmod order implicitly)
  const unique = dedupe(details, (d) => d.url);
  console.log(`🧩 ${unique.length} unique products resolved`);

  // Bucket by category (deterministic classifier)
  const silos = {
    ai: [],
    marketing: [],
    courses: [],
    productivity: [],
    business: [],
    web: [],
    ecommerce: [],
    creative: [],
    software: [],
  };

  for (const item of unique) {
    const cat = (item.category || classify(item.title, item.url)).toLowerCase();
    if (silos[cat]) silos[cat].push(item);
    else silos.software.push(item);
  }

  // Normalize → enrich (per own category) → NEW-FIRST+LASTMOD active-cap merge → write per category
  for (const [cat, arr] of Object.entries(silos)) {
    if (!arr.length) {
      const cached = readJsonSafe(`appsumo-${cat}.json`, []);
      console.log(`♻️ ${cat}: no fresh items, using cache (${cached.length})`);
      continue;
    }

    let cleaned = normalizeFeed(arr);

    // Enrich with CTA/subtitle tuned per item’s own category (regen later may overwrite globally)
    cleaned = enrichDeals(cleaned);

    // NEW-FIRST + LASTMOD priority active-cap aware merge
    const merged = mergeWithHistoryActiveCap(cat, cleaned, MAX_PER_CATEGORY);

    writeJson(`appsumo-${cat}.json`, merged);

    const activeCount = merged.filter((x) => !x.archived).length;
    const totalCount = merged.length;
    console.log(
      `🧹 ${cat}: ${activeCount} active / ${totalCount} total (normalized + merged)`
    );
  }

  console.log("\n✨ All silos refreshed (v8.0 Deterministic New-First + Lastmod + First-Seen tracking).");
}

// Execute
main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
