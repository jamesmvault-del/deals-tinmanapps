// /scripts/updateFeed.js
/**
 * TinmanApps Adaptive Feed Engine v11.0
 * “Render-Safe • Deterministic • Chunked Discovery • Masked Referrals Only”
 * ───────────────────────────────────────────────────────────────────────────────
 * ✅ Render-safe (no headless Chrome)
 * ✅ Discovers AppSumo product URLs via XML sitemaps (<lastmod> aware)
 * ✅ Fetches OG data → Normalizes core fields (title, slug, category, description)
 * ✅ NO CTA/SUBTITLE GENERATION HERE (centralised in /api/master-cron)
 * ✅ All referral URLs masked through /api/track (no raw AppSumo links cached)
 * ✅ Chunked discovery + capped crawl size for Starter tier
 * ✅ History merge: new-first + lastmod priority + archive tracking
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import crypto from "crypto";

import { normalizeFeed } from "../lib/feedNormalizer.js";

// ───────────────────────────────────────────────────────────────────────────────
// Paths & constants
// ───────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

// Impact / AppSumo affiliate prefix (raw external target — NEVER exposed directly)
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

const MAX_PER_CATEGORY = Number(process.env.MAX_PER_CATEGORY || 10);
const DETAIL_CONCURRENCY = 6;
const PRODUCT_URL_HARD_CAP = Number(process.env.PRODUCT_URL_HARD_CAP || 300);
const PRODUCT_DISCOVERY_CHUNK = Number(process.env.PRODUCT_DISCOVERY_CHUNK || 100);
const HTTP_TIMEOUT_MS = 10000;
const RETRIES = 2;

// ───────────────────────────────────────────────────────────────────────────────
// Helpers: FS / JSON / crypto / fetch
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
          "TinmanApps/UpdateFeed v11.0 (Render-safe XML crawler; contact: admin@tinmanapps.com)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.text();
  } catch (e) {
    if (tries > 0) {
      await new Promise((r) => setTimeout(r, 300 * (RETRIES - tries + 1)));
      return fetchText(url, tries - 1);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// URL / meta helpers
// ───────────────────────────────────────────────────────────────────────────────
function toSlug(url) {
  const m =
    url?.match(/\/products\/([^/]+)\/?$/i) ||
    url?.match(/\/products\/([^/]+)\//i);
  return m ? m[1] : null;
}
function extractMeta(html, name) {
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
  if (!src) return `${SITE_ORIGIN}/assets/placeholder.webp`;
  return `${SITE_ORIGIN}/api/image-proxy?src=${encodeURIComponent(src)}`;
}

/**
 * Build the internal masked referral URL used everywhere in the system.
 * Publicly visible link is ALWAYS this /api/track URL (no raw AppSumo leakage).
 */
function buildTrackedReferral({ slug, cat, url }) {
  if (!url) return null;
  const safeSlug = slug || toSlug(url) || "untitled";
  const safeCat = cat || "software";

  // External affiliate target (never shown directly)
  const masked = REF_PREFIX + encodeURIComponent(url);

  // Public, internal redirector
  return `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(
    safeSlug
  )}&cat=${encodeURIComponent(safeCat)}&redirect=${encodeURIComponent(masked)}`;
}

function normalizeEntry({ slug, title, url, cat, image, description, lastmod }) {
  const safeSlug =
    slug ||
    toSlug(url) ||
    (title || "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
  const slugFinal = safeSlug || "untitled";

  return {
    title: title || slugFinal || "Untitled",
    slug: slugFinal,
    category: cat,
    url,
    referralUrl: buildTrackedReferral({ slug: slugFinal, cat, url }),
    image: proxied(image),
    description: description || null, // ⬅️ keep description for context-aware CTA later
    lastmodAt: lastmod ? new Date(lastmod).toISOString() : null,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Category classifier
// ───────────────────────────────────────────────────────────────────────────────
function classify(title, url) {
  const t = String(title || "").toLowerCase();
  const u = String(url || "").toLowerCase();

  if (/\b(ai|chatgpt|gpt|machine learning|ml|nlp|stable diffusion)\b/i.test(t))
    return "ai";
  if (/\b(course|academy|bootcamp|lesson|tutorial|training|masterclass)\b/i.test(t))
    return "courses";
  if (/\b(marketing|seo|campaign|newsletter|social|advert|affiliate|influencer)\b/i.test(t))
    return "marketing";
  if (/\b(task|kanban|todo|calendar|pomodoro|productivity|habit|meeting)\b/i.test(t))
    return "productivity";
  if (/\b(woocommerce|shopify|checkout|cart|store|ecommerce|upsell)\b/i.test(t))
    return "ecommerce";
  if (/\b(brand|design|graphic|video|image|creative|studio|art|logo)\b/i.test(t))
    return "creative";
  if (/\b(website|wordpress|landing|builder|webflow|frontend|page builder|ui|ux)\b/i.test(t))
    return "web";
  if (/\b(crm|invoice|accounting|clients|agency|operations|analytics|finance)\b/i.test(t))
    return "business";

  return "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// Sitemap discovery (chunked, capped)
// ───────────────────────────────────────────────────────────────────────────────
async function discoverProductUrls() {
  const canonicalize = (u) => {
    try {
      const s = new URL(u);
      if (!/\/products\/[^/]+\/?$/i.test(s.pathname)) return null;
      s.pathname = s.pathname.replace(/\/+$/, "/");
      return s.toString();
    } catch {
      return null;
    }
  };
  const collectFromUrlset = (urlset) => {
    const out = [];
    const rows = urlset?.url || [];
    for (const row of rows) {
      const loc = row.loc?.[0];
      const lm = row.lastmod?.[0];
      const canon = canonicalize(loc);
      if (canon) out.push({ url: canon, lastmod: lm || null });
    }
    return out;
  };
  const parseSitemapAt = async (url) => {
    try {
      const xml = await fetchText(url);
      return await parseStringPromise(xml);
    } catch {
      return null;
    }
  };

  const seen = new Map();
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

    if (doc.urlset) {
      for (const { url, lastmod } of collectFromUrlset(doc.urlset)) {
        if (seen.size >= PRODUCT_URL_HARD_CAP) break;
        const prev = seen.get(url);
        if (!prev || (lastmod && new Date(lastmod) > new Date(prev))) {
          seen.set(url, lastmod || prev || null);
        }
      }
    }

    const subs = doc.sitemapindex?.sitemap || [];
    for (const sm of subs) {
      const loc = sm.loc?.[0];
      if (loc && !visited.has(loc)) queue.push(loc);
    }

    if (seen.size % PRODUCT_DISCOVERY_CHUNK === 0) {
      console.log(`🪶 Discovery checkpoint: ${seen.size} URLs so far…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const list = Array.from(seen.entries()).map(([url, lastmod]) => ({ url, lastmod }));
  console.log(`🧭 Discovered ${list.length} product URLs`);
  return list.slice(0, PRODUCT_URL_HARD_CAP);
}

// ───────────────────────────────────────────────────────────────────────────────
// Simplified SEO validity (legacy only — CTA regenerated in master-cron)
// ───────────────────────────────────────────────────────────────────────────────
function isGoodSEO(seo = {}) {
  const c = seo?.cta?.trim() || "";
  const s = seo?.subtitle?.trim() || "";
  return c.length > 6 && s.length > 10;
}

// ───────────────────────────────────────────────────────────────────────────────
// Active-cap merge (now also re-masks referral URLs for ALL entries)
// ───────────────────────────────────────────────────────────────────────────────
function mergeWithHistoryActiveCap(cat, fresh, cap) {
  const nowISO = new Date().toISOString();
  const file = `appsumo-${cat}.json`;
  const existing = readJsonSafe(file, []);
  const prevBySlug = new Map(existing.map((x) => [x.slug, x]));

  const sortByRecency = (a, b) => {
    const la = a.lastmodAt ? Date.parse(a.lastmodAt) : 0;
    const lb = b.lastmodAt ? Date.parse(b.lastmodAt) : 0;
    if (lb !== la) return lb - la;
    return String(a.title || a.slug).localeCompare(String(b.title || b.slug));
  };

  const ordered = [...fresh].sort(sortByRecency);
  const activeSet = new Set(
    (Number.isFinite(cap) ? ordered.slice(0, cap) : ordered).map((x) => x.slug)
  );

  const merged = [];

  // 1) Fresh + previously known items (active/archive status from new crawl)
  for (const item of fresh) {
    const prev = prevBySlug.get(item.slug);

    const baseUrl = item.url || prev?.url || null;
    const referralUrl = buildTrackedReferral({
      slug: item.slug,
      cat,
      url: baseUrl,
    });

    const chooseSeo =
      (item.seo && isGoodSEO(item.seo) ? item.seo : null) ||
      (prev?.seo && isGoodSEO(prev.seo) ? prev.seo : null) ||
      { cta: "View deal →", subtitle: "Discover the full offer details." };

    merged.push({
      ...item,
      url: baseUrl,
      referralUrl, // ⬅️ always re-masked via /api/track
      seo: chooseSeo,
      firstSeenAt: prev?.firstSeenAt || nowISO,
      lastSeenAt: nowISO,
      lastmodAt: item.lastmodAt || prev?.lastmodAt || null,
      archived: !activeSet.has(item.slug),
    });
  }

  // 2) Items that disappeared from fresh crawl → archive them, re-mask referralUrl
  for (const prev of existing) {
    if (!fresh.find((x) => x.slug === prev.slug)) {
      const baseUrl = prev.url || null;
      const referralUrl = buildTrackedReferral({
        slug: prev.slug,
        cat,
        url: baseUrl,
      });

      merged.push({
        ...prev,
        url: baseUrl,
        referralUrl, // ⬅️ re-masked even for old entries
        archived: true,
        lastSeenAt: prev.lastSeenAt || nowISO,
        seo: isGoodSEO(prev.seo)
          ? prev.seo
          : { cta: "View deal →", subtitle: "Discover the full offer details." },
      });
    }
  }

  return merged;
}

// ───────────────────────────────────────────────────────────────────────────────
// Main (chunk-safe, capped discovery)
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  ensureDir(DATA_DIR);

  console.log("⏳ Discovering AppSumo products…");
  const discovered = await discoverProductUrls();
  if (!discovered.length) {
    console.warn("⚠️ No product URLs discovered — keeping existing silos untouched.");
    return;
  }

  const cappedList = discovered.slice(0, PRODUCT_URL_HARD_CAP);
  console.log(`🔢 Processing capped subset: ${cappedList.length} URLs (of ${discovered.length})`);

  const details = [];
  for (let i = 0; i < cappedList.length; i += DETAIL_CONCURRENCY) {
    const chunk = cappedList.slice(i, i + DETAIL_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (entry) => {
        const { url, lastmod } = entry;
        const slug = toSlug(url);
        try {
          const html = await fetchText(url);
          const og = extractOg(html);
          const titleClean = (og.title || "").split(/\s*[-–—]\s*/)[0].trim();
          const cat = classify(titleClean || og.title || "", url);

          // Keep BOTH title + description so CTA Engine (in master-cron) can be context-aware
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
      })
    );
    details.push(...chunkResults);
    console.log(`🪄 Processed ${details.length}/${cappedList.length} entries…`);
  }

  const unique = dedupe(details, (d) => d.url);
  console.log(`🧩 ${unique.length} unique products resolved`);

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

  for (const [cat, arr] of Object.entries(silos)) {
    if (!arr.length) {
      const cached = readJsonSafe(`appsumo-${cat}.json`, []);
      console.log(`♻️ ${cat}: no fresh items, using cache (${cached.length})`);
      continue;
    }

    // Normalise structural fields (title, slug, description, image, url)
    let cleaned = normalizeFeed(arr);

    // Re-enforce referral mask AFTER normalization so nothing strips our tracking URL
    cleaned = cleaned.map((d) => ({
      ...d,
      referralUrl: buildTrackedReferral({
        slug: d.slug,
        cat,
        url: d.url,
      }),
    }));

    // Merge with history + active cap, preserving archive and re-masking legacy referrals
    const merged = mergeWithHistoryActiveCap(cat, cleaned, MAX_PER_CATEGORY);

    writeJson(`appsumo-${cat}.json`, merged);
    console.log(
      `🧹 ${cat}: ${merged.filter((x) => !x.archived).length} active / ${merged.length} total`
    );
  }

  console.log(
    "\n✨ All silos refreshed (v11.0: masked referrals enforced, CTA generation delegated to master-cron)."
  );
}

// Execute
main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
