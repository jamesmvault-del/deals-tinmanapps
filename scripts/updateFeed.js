/**
 * /scripts/updateFeed.js
 * TinmanApps Adaptive Feed Engine v7.6
 * “Render-Safe • Self-Healing • Cluster v5 • Creative+Ecommerce Silos”
 * ───────────────────────────────────────────────────────────────────────────────
 * ✅ 100% Render-safe (no headless Chrome)
 * ✅ Discovers products from AppSumo XML sitemaps (resilient fallbacks)
 * ✅ Fetches product pages via HTTP; extracts OG:title / OG:image / meta:description
 * ✅ Classifies with Semantic Cluster v5 (detectCluster) — deterministic & safe
 * ✅ Normalizes (feedNormalizer v2) → Enriches (ctaEngine v4.5) per category
 * ✅ Preserves historical CTAs/subtitles (mergeWithHistory) + archives missing
 * ✅ Includes ecommerce & creative silos (parity with proxyCache / clusters)
 * ✅ MAX_PER_CATEGORY easy flip to Infinity for “show everything”
 * ✅ Clean, deterministic, non-conflicting with master-cron / evolver
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import crypto from "crypto";

import { createCtaEngine, enrichDeals } from "../lib/ctaEngine.js";
import { normalizeFeed } from "../lib/feedNormalizer.js";
import { detectCluster } from "../lib/semanticCluster.js";

// ───────────────────────────────────────────────────────────────────────────────
// Paths & constants
// ───────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u="; // masked affiliate base

// Tuning — adjust freely
const MAX_PER_CATEGORY = 10;                 // set to Infinity to show all
const DETAIL_CONCURRENCY = 8;                // HTTP concurrency
const PRODUCT_URL_HARD_CAP = 500;            // safety guard
const HTTP_TIMEOUT_MS = 12000;               // per-request guard
const RETRIES = 2;                           // network retry attempts

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
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const i of items) {
    const k = sha1(i.url || i.slug || i.title);
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
          "TinmanApps/UpdateFeed v7.6 (Render-safe XML crawler; contact: admin@tinmanapps.com)",
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

function normalizeEntry({ slug, title, url, cat, image, description }) {
  const safeSlug =
    slug ||
    toSlug(url) ||
    (title || "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
  return {
    title: title || safeSlug,
    slug: safeSlug,
    category: cat,
    url, // raw product url (normalizeFeed will map to link/referral later)
    referralUrl: tracked({ slug: safeSlug, cat, url }),
    image: image ? proxied(image) : `${SITE_ORIGIN}/assets/placeholder.webp`,
    description: description || null,
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
// Category classification — use Semantic Cluster v5
// ───────────────────────────────────────────────────────────────────────────────
function classify(title, url) {
  // Prefer strong title signals; fallback to URL hints; guaranteed fallback to 'software'
  const t = String(title || "").trim();
  const guess = detectCluster(t);
  if (guess && guess !== "software") return guess;

  // URL nudges (defensive)
  if (/\/courses?\b|academy|tutorial|training/i.test(url)) return "courses";
  if (/\/marketing|crm|leads|campaign/i.test(url)) return "marketing";
  if (/\/productivity|task|kanban|calendar/i.test(url)) return "productivity";
  if (/\/web|wordpress|landing|builder/i.test(url)) return "web";
  if (/\/shop|store|checkout|cart|ecommerce/i.test(url)) return "ecommerce";
  if (/\/creative|design|brand|media|graphics?/i.test(url)) return "creative";

  return "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// Sitemap discovery (XML-first; Render-safe)
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

async function discoverProductUrls() {
  const productUrls = new Set();

  // 1) Fetch root sitemap (could be urlset or sitemapindex)
  let root;
  try {
    const xml = await fetchText("https://appsumo.com/sitemap.xml");
    root = await parseStringPromise(xml);
  } catch (err) {
    console.warn("⚠️ root sitemap fetch failed:", err.message);
    root = null;
  }

  const toCrawl = new Set();

  const indexEntries =
    root?.sitemapindex?.sitemap?.map((s) => s.loc?.[0]).filter(Boolean) || [];
  indexEntries.forEach((u) => toCrawl.add(u));

  const urlEntries = root?.urlset?.url?.map((u) => u.loc?.[0]).filter(Boolean) || [];
  urlEntries.forEach((u) => toCrawl.add(u));

  // known variants (defensive)
  [
    "https://appsumo.com/sitemap.xml",
    "https://appsumo.com/sitemap_index.xml",
    "https://appsumo.com/sitemap-products.xml",
    "https://appsumo.com/sitemap-products1.xml",
    "https://appsumo.com/sitemap_products.xml",
  ].forEach((u) => toCrawl.add(u));

  // 2) crawl sitemaps and extract /products/... pages
  for (const url of Array.from(toCrawl)) {
    if (!/sitemap/i.test(url)) continue;
    try {
      const xml = await fetchText(url);
      const parsed = await parseStringPromise(xml);
      const urls =
        parsed?.urlset?.url?.map((u) => u.loc?.[0]).filter(Boolean) ||
        parsed?.sitemapindex?.sitemap?.map((s) => s.loc?.[0]).filter(Boolean) ||
        [];

      for (const locRaw of urls) {
        const loc = canonicalize(locRaw);
        if (!loc) continue;
        productUrls.add(loc);
        if (productUrls.size >= PRODUCT_URL_HARD_CAP) break;
      }
    } catch {
      // continue silently
    }
    if (productUrls.size >= PRODUCT_URL_HARD_CAP) break;
  }

  // 3) very small HTML fallback — /software/ page links
  if (productUrls.size === 0) {
    try {
      const html = await fetchText("https://appsumo.com/software/");
      const matches = Array.from(
        html.matchAll(/href=["'](https?:\/\/[^"']*\/products\/[^"']*\/?)["']/gi)
      ).map((m) => canonicalize(m[1]));
      for (const u of matches) {
        if (!u) continue;
        productUrls.add(u);
        if (productUrls.size >= PRODUCT_URL_HARD_CAP) break;
      }
    } catch {
      // ignore
    }
  }

  const list = Array.from(productUrls).slice(0, PRODUCT_URL_HARD_CAP);
  console.log(`🧭 Discovered ${list.length} product URLs`);
  return list;
}

// ───────────────────────────────────────────────────────────────────────────────
// Detail fetch (Render-safe; retries; OG + description)
// ───────────────────────────────────────────────────────────────────────────────
async function fetchDetail(url) {
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
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Merge Logic — preserve CTAs/subtitles, archive missing
// ───────────────────────────────────────────────────────────────────────────────
function mergeWithHistory(cat, fresh) {
  const file = `appsumo-${cat}.json`;
  const existing = readJsonSafe(file, []);
  const map = new Map(existing.map((x) => [x.slug, x]));

  const merged = fresh.map((item) => {
    const old = map.get(item.slug);
    const preservedSeo = old?.seo || {};
    return {
      ...item,
      seo: {
        cta: item.seo?.cta || preservedSeo.cta || null,
        subtitle: item.seo?.subtitle || preservedSeo.subtitle || null,
      },
      archived: false,
    };
  });

  for (const old of existing) {
    if (!merged.find((x) => x.slug === old.slug)) {
      merged.push({ ...old, archived: true });
    }
  }

  return merged;
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  ensureDir(DATA_DIR);

  // Ensure CTA engine templates are initialized
  createCtaEngine();
  console.log("✅ CTA Engine ready");

  console.log("⏳ Discovering AppSumo products…");
  const productUrls = await discoverProductUrls();

  // If discovery fails entirely, do not clobber existing category files
  if (!productUrls.length) {
    console.warn("⚠️ No product URLs discovered — keeping existing category silos untouched.");
    console.log("✨ UpdateFeed v7.6 completed (no-op due to zero discovery).");
    return;
  }

  // Fetch details in parallel
  const details = await withConcurrency(productUrls, DETAIL_CONCURRENCY, fetchDetail);
  const unique = dedupe(details);
  console.log(`🧩 ${unique.length} unique products resolved`);

  // Bucket by category (semantic v5)
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
    const cat = item.category || classify(item.title, item.url);
    if (silos[cat]) silos[cat].push(item);
    else silos.software.push(item);
  }

  // Normalize → limit → enrich → merge → write per category
  for (const [cat, arr] of Object.entries(silos)) {
    if (!arr.length) {
      const cached = readJsonSafe(`appsumo-${cat}.json`, []);
      console.log(`♻️ ${cat}: no fresh items, using cache (${cached.length})`);
      continue;
    }

    let cleaned = normalizeFeed(arr);

    // stability + page weight; flip to Infinity when ready to show all
    cleaned = cleaned.slice(0, MAX_PER_CATEGORY);

    // enrich with CTA/subtitle tuned per category
    cleaned = enrichDeals(cleaned, cat);

    // preserve historical SEO & archive missing
    const merged = mergeWithHistory(cat, cleaned);

    writeJson(`appsumo-${cat}.json`, merged);
    console.log(`🧹 ${cat}: normalized + merged (${merged.length} entries)`);
  }

  console.log("\n✨ All silos refreshed (v7.6 Render-Safe • Cluster v5 • Creative+Ecommerce).");
}

// Execute
main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
