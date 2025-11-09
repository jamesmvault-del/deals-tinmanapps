// /scripts/updateFeed.js
// TinmanApps Adaptive Feed Engine v7.0 “Render-Safe No-Browser Edition”
// ───────────────────────────────────────────────────────────────────────────────
// • Removes Puppeteer entirely (no Chrome dependency; safe for Render dynos)
// • Discovers products directly from AppSumo sitemaps (XML only)
// • Fetches product pages via HTTP and extracts OG tags (title/image)
// • Classifies into silos; normalizes, enriches with CTA Engine, and merges
// • Preserves existing CTAs/subtitles; archives missing products
// ───────────────────────────────────────────────────────────────────────────────

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
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// Tuning
const MAX_PER_CATEGORY = 10;              // cap per silo written out
const DETAIL_CONCURRENCY = 8;             // HTTP concurrency for product pages
const PRODUCT_URL_HARD_CAP = 500;         // don’t pull more than this from sitemaps

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
async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
function toSlug(url) {
  const m = url?.match(/\/products\/([^/]+)\//i);
  return m ? m[1] : null;
}
function extractOg(html) {
  const get = (p) =>
    html.match(
      new RegExp(`<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']+)["']`, "i")
    )?.[1];
  return {
    title: get("og:title") || html.match(/<title>([^<]+)<\/title>/i)?.[1],
    image: get("og:image") || get("twitter:image"),
  };
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
function normalizeEntry({ slug, title, url, cat, image }) {
  const safeSlug = slug || toSlug(url) || (title || "").toLowerCase().replace(/\s+/g, "-");
  return {
    title: title || safeSlug,
    slug: safeSlug,
    category: cat,
    url,
    referralUrl: tracked({ slug: safeSlug, cat, url }),
    image: image ? proxied(image) : `${SITE_ORIGIN}/assets/placeholder.webp`,
  };
}
async function withConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        out[idx] = await worker(items[idx], idx);
      } catch (err) {
        console.warn(`⚠️ worker ${idx} failed: ${err.message}`);
      }
    }
  });
  await Promise.all(runners);
  return out.filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────────
// Silo Classification (keyword score based)
// ───────────────────────────────────────────────────────────────────────────────
const SILO_KEYWORDS = {
  ai: [" ai", "gpt", "automation", "autopilot", "assistant", "copilot", "bot", "agent", "llm", "chat", "voice ai"],
  marketing: ["marketing", "seo", "social", "sales", "lead", "crm", "advertising", "email", "campaign", "traffic", "growth", "conversion", "content"],
  courses: ["course", "academy", "training", "teach", "learn", "creator", "coach", "skill", "education", "tutorial", "lesson", "instructor", "mentor"],
  productivity: ["productivity", "task", "workflow", "project", "kanban", "time", "schedule", "calendar", "focus", "collaboration", "team", "meeting"],
  business: ["accounting", "finance", "invoice", "legal", "hr", "contract", "analytics", "report", "startup", "management", "client", "agency"],
  web: ["builder", "website", "landing", "design", "no-code", "hosting", "frontend", "cms", "theme", "plugin", "webapp"],
};
function classify(title, url) {
  const text = `${title} ${url}`.toLowerCase();
  let best = "software";
  let max = 0;
  for (const [silo, keys] of Object.entries(SILO_KEYWORDS)) {
    let score = 0;
    for (const k of keys) if (text.includes(k)) score++;
    if (score > max) {
      max = score;
      best = silo;
    }
  }
  if (/\/courses?-/.test(url)) best = "courses";
  return best;
}

// ───────────────────────────────────────────────────────────────────────────────
// Sitemap Discovery (no JS, pure XML fetch)
// ───────────────────────────────────────────────────────────────────────────────
async function discoverProductUrls() {
  const productUrls = new Set();

  // 1) Fetch root sitemap (may be <urlset> or <sitemapindex>)
  let root;
  try {
    const xml = await fetchText("https://appsumo.com/sitemap.xml");
    root = await parseStringPromise(xml);
  } catch (err) {
    console.warn("⚠️ sitemap.xml fetch/parse failed:", err.message);
    root = null;
  }

  // 2) Collect candidates to crawl
  const toCrawl = new Set();

  // If root is a sitemap index
  const indexEntries = root?.sitemapindex?.sitemap?.map((s) => s.loc?.[0]).filter(Boolean) || [];
  indexEntries.forEach((u) => toCrawl.add(u));

  // If root is a plain urlset, also read it
  const urlEntries = root?.urlset?.url?.map((u) => u.loc?.[0]).filter(Boolean) || [];
  urlEntries.forEach((u) => toCrawl.add(u));

  // Always include a few known sitemaps (defensive)
  [
    "https://appsumo.com/sitemap.xml",
    "https://appsumo.com/sitemap_index.xml",
    "https://appsumo.com/sitemap-products.xml",
    "https://appsumo.com/sitemap-products1.xml",
    "https://appsumo.com/sitemap_products.xml",
    "https://appsumo.com/software/",
  ].forEach((u) => toCrawl.add(u));

  // 3) Crawl each XML that looks like a sitemap; collect /products/... pages
  for (const url of Array.from(toCrawl)) {
    if (!/sitemap/i.test(url)) continue; // only try XML sitemaps here
    try {
      const xml = await fetchText(url);
      const parsed = await parseStringPromise(xml);
      const urls =
        parsed?.urlset?.url?.map((u) => u.loc?.[0]).filter(Boolean) ||
        parsed?.sitemapindex?.sitemap?.map((s) => s.loc?.[0]).filter(Boolean) ||
        [];
      for (const loc of urls) {
        if (typeof loc === "string" && /\/products\/[^/]+\/$/i.test(loc)) {
          productUrls.add(loc);
          if (productUrls.size >= PRODUCT_URL_HARD_CAP) break;
        }
      }
    } catch {
      // silently continue
    }
    if (productUrls.size >= PRODUCT_URL_HARD_CAP) break;
  }

  // If still empty (some sites lock sitemaps), do a very small HTML fallback:
  // try the main /software/ page and pick hrefs that include /products/
  if (productUrls.size === 0) {
    try {
      const html = await fetchText("https://appsumo.com/software/");
      const matches = Array.from(
        html.matchAll(/href=["'](https?:\/\/[^"']*\/products\/[^"']*\/)["']/gi)
      ).map((m) => m[1].replace(/\/+$/, "/"));
      for (const u of matches) {
        productUrls.add(u);
        if (productUrls.size >= PRODUCT_URL_HARD_CAP) break;
      }
    } catch {
      // ignore
    }
  }

  const list = Array.from(productUrls).slice(0, PRODUCT_URL_HARD_CAP);
  console.log(`🧭 Discovered ${list.length} product URLs from sitemaps.`);
  return list;
}

// ───────────────────────────────────────────────────────────────────────────────
// Detail Fetch (HTTP only, no JS execution)
// ───────────────────────────────────────────────────────────────────────────────
async function fetchDetail(url) {
  const slug = toSlug(url);
  try {
    const html = await fetchText(url);
    const og = extractOg(html);
    return normalizeEntry({
      slug,
      title: (og.title || "").split(/\s*[-–—]\s*/)[0].trim(),
      url,
      cat: classify(og.title || "", url),
      image: og.image,
    });
  } catch {
    // Fallback with minimal info
    return normalizeEntry({
      slug,
      title: (slug || "").replace(/[-_]/g, " "),
      url,
      cat: classify(slug || "", url),
      image: null,
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Merge Logic — preserve CTAs, add new, archive missing
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
  // Ensure data dir exists early
  ensureDir(DATA_DIR);

  // Init CTA Engine to guarantee availability of templates
  createCtaEngine();
  console.log("✅ CTA Engine ready");

  console.log("⏳ Discovering products from AppSumo sitemaps (no-browser) …");
  const productUrls = await discoverProductUrls();

  // Fetch details with concurrency
  const details = await withConcurrency(productUrls, DETAIL_CONCURRENCY, fetchDetail);
  const unique = dedupe(details);
  console.log(`🧩 ${unique.length} unique products resolved.`);

  // Bucket into silos
  const silos = {
    ai: [],
    marketing: [],
    courses: [],
    productivity: [],
    business: [],
    web: [],
    software: [],
  };
  for (const item of unique) {
    const cat = item.category || classify(item.title, item.url);
    if (silos[cat]) silos[cat].push(item);
    else silos.software.push(item);
  }

  // Normalize, enrich, merge, and write per silo
  for (const [cat, arr] of Object.entries(silos)) {
    if (!arr.length) {
      const cached = readJsonSafe(`appsumo-${cat}.json`, []);
      console.log(`♻️ ${cat}: using cached data (${cached.length})`);
      continue;
    }

    // Normalize & enrich
    let cleaned = normalizeFeed(arr);
    // Limit per category for stability & page weight
    cleaned = cleaned.slice(0, MAX_PER_CATEGORY);
    cleaned = enrichDeals(cleaned, cat);

    // Merge with history
    const merged = mergeWithHistory(cat, cleaned);
    console.log(`🧹 ${cat}: normalized + merged (${merged.length} entries)`);

    // Persist
    writeJson(`appsumo-${cat}.json`, merged);
  }

  console.log("\n✨ All silos refreshed (v7.0 Render-Safe No-Browser Edition).");
}

// Execute
main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
