// /scripts/updateFeed.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps Adaptive Feed Engine v4.6 — “Deferred Hydra”
//
// • Headless-safe GraphQL intercept with deferred hydration wait
// • Captures BOTH legacy and new AppSumo queries:
//    - ListingPageQuery
//    - ListingProductsQuery
// • Human-like interaction loop + 60s verification window (+ retries)
// • Triple fallback (GraphQL → RSS → Cache) with clear, CTR-safe logging
// • Fully compatible with /api/master-cron, /api/insight.js, /lib/ctaEvolver.js
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { createCtaEngine } from "../lib/ctaEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

const CATEGORY_URLS = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  productivity: "https://appsumo.com/software/productivity/",
  ai: "https://appsumo.com/software/artificial-intelligence/",
  courses: "https://appsumo.com/courses-more/",
};

// Some RSS feeds are deprecated on AppSumo, but keep what might still exist.
const RSS_FALLBACKS = {
  productivity: "https://appsumo.com/software/productivity/rss/",
  ai: "https://appsumo.com/software/artificial-intelligence/rss/",
  software: "https://appsumo.com/software/rss/",
  marketing: "https://appsumo.com/software/marketing-sales/rss/",
  courses: "https://appsumo.com/courses-more/rss/",
};

const MAX_PER_CATEGORY = Number(process.env.MAX_PER_CATEGORY || 120);
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 8);
const NAV_TIMEOUT_MS = 45_000;
const HYDRATION_WAIT_MS = Number(process.env.HYDRATION_WAIT_MS || 60_000);
const GRAPHQL_MIN_EXPECTED = Number(process.env.GRAPHQL_MIN_EXPECTED || 12);
const GRAPHQL_RETRIES = Number(process.env.GRAPHQL_RETRIES || 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function writeJson(file, data) { ensureDir(DATA_DIR); fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); }
function readJsonSafe(file, fallback = []) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); } catch { return fallback; } }
function toSlugFromUrl(url) { const m = url?.match(/\/products\/([^/]+)\//i); return m ? m[1] : null; }
function proxiedImage(src) { return `${SITE_ORIGIN}/api/image-proxy?src=${encodeURIComponent(src)}`; }
function trackedUrl({ slug, cat, url }) {
  const masked = REF_PREFIX + encodeURIComponent(url);
  return `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(slug)}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(masked)}`;
}
function normalizeRecord({ slug, title, url, cat, image }) {
  const safeSlug = slug || toSlugFromUrl(url) || (title ? title.toLowerCase().replace(/\s+/g, "-") : "deal");
  return {
    title: title || safeSlug,
    slug: safeSlug,
    category: cat,
    url,
    referralUrl: trackedUrl({ slug: safeSlug, cat, url }),
    image: image ? proxiedImage(image) : `${SITE_ORIGIN}/assets/placeholder.webp`,
    seo: {
      clickbait: `Discover ${title || safeSlug} — #1 in ${cat}`,
      keywords: [cat, "AppSumo", "lifetime deal", safeSlug, "exclusive offer"],
    },
  };
}
function extractOg(html) {
  const get = (prop) => {
    const rx = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
    const m = html.match(rx);
    return m ? m[1] : null;
  };
  return {
    title: get("og:title") || html.match(/<title>([^<]+)<\/title>/i)?.[1] || null,
    image: get("og:image") || get("twitter:image") || get("og:image:secure_url") || null,
  };
}
async function fetchText(url, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

// ───────────────────────────────────────────────────────────────────────────────
// GraphQL intercept helpers
// ───────────────────────────────────────────────────────────────────────────────

// Walk an arbitrary JSON tree and collect product URLs under any property set.
function collectProductUrlsFromJson(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const v of node) collectProductUrlsFromJson(v, out);
    return;
  }
  // Heuristic: any node with { url, title } and url like "/products/.."
  if (typeof node.url === "string" && node.url.startsWith("/products/") && typeof node.title === "string") {
    out.add(`https://appsumo.com${node.url}`);
  }
  for (const k of Object.keys(node)) collectProductUrlsFromJson(node[k], out);
}

async function interceptCategoryGraphQL(cat, listUrl, attemptIdx) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--no-zygote", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const captured = new Set();
  const start = Date.now();

  // Listen for ANY /graphql responses; accept both old & new query names.
  page.on("response", async (res) => {
    const u = res.url();
    if (!u.includes("/graphql")) return;
    // Content-type guard
    const ct = res.headers()["content-type"] || "";
    if (!ct.includes("application/json")) return;
    try {
      const json = await res.json();
      // accept legacy and deferred query shapes
      // e.g., data.listingPage.listingsConnection.edges[].node
      // or data.listingProducts.* or similar variants.
      collectProductUrlsFromJson(json?.data, captured);
    } catch { /* swallow */ }
  });

  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  console.log(`  🛰️ Intercept pass ${attemptIdx + 1} → waiting up to ${Math.round(HYDRATION_WAIT_MS/1000)}s for GraphQL…`);

  // Human-like interaction loop during wait window
  while (Date.now() - start < HYDRATION_WAIT_MS && captured.size < GRAPHQL_MIN_EXPECTED) {
    await page.mouse.move(120 + Math.random() * 200, 200 + Math.random() * 250);
    await page.mouse.wheel({ deltaY: 1200 });
    await sleep(1200 + Math.random() * 600);
  }

  // Final grace for background requests to finish
  await sleep(2000);
  const links = Array.from(captured).slice(0, MAX_PER_CATEGORY);

  await page.close();
  await browser.close();

  if (links.length > 0) {
    console.log(`  🧠 Captured ${links.length} products via GraphQL for ${cat}`);
  } else {
    console.log(`  ⚠️ No GraphQL payload captured for ${cat} (attempt ${attemptIdx + 1})`);
  }
  return links;
}

// ───────────────────────────────────────────────────────────────────────────────
// RSS fallback
// ───────────────────────────────────────────────────────────────────────────────
async function fetchRssFallback(cat) {
  const feedUrl = RSS_FALLBACKS[cat];
  if (!feedUrl) return [];
  try {
    const xml = await fetchText(feedUrl);
    const data = await parseStringPromise(xml);
    const items = data?.rss?.channel?.[0]?.item || [];
    return items.map((it) => {
      const link = it.link?.[0];
      const title = it.title?.[0];
      if (!link || !title) return null;
      const slug = toSlugFromUrl(link);
      return normalizeRecord({ slug, title, url: link, cat, image: null });
    }).filter(Boolean).slice(0, MAX_PER_CATEGORY);
  } catch (err) {
    console.warn(`  ⚠️ RSS fallback failed for ${cat}: ${err.message}`);
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Product detail + enrichment
// ───────────────────────────────────────────────────────────────────────────────
async function fetchProductDetail(url, cat) {
  try {
    const html = await fetchText(url);
    const og = extractOg(html);
    const slug = toSlugFromUrl(url);
    return normalizeRecord({ slug, title: og.title || slug, url, cat, image: og.image });
  } catch {
    const slug = toSlugFromUrl(url);
    return normalizeRecord({ slug, title: slug, url, cat, image: null });
  }
}
async function withConcurrency(items, limit, worker) {
  const out = new Array(items.length); let i = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++; if (idx >= items.length) return;
      try { out[idx] = await worker(items[idx], idx); }
      catch (err) { console.error(`❌ Worker failed on item ${idx}:`, err.message); }
    }
  });
  await Promise.all(runners);
  return out.filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────────
// Category build
// ───────────────────────────────────────────────────────────────────────────────
async function buildCategory(engine, cat, listUrl) {
  console.log(`\n⏳ Fetching ${cat} → ${listUrl}`);
  let links = [];

  // Try GraphQL intercept (with retries)
  for (let attempt = 0; attempt < GRAPHQL_RETRIES && links.length < GRAPHQL_MIN_EXPECTED; attempt++) {
    try {
      links = await interceptCategoryGraphQL(cat, listUrl, attempt);
    } catch (err) {
      console.warn(`  ⚠️ GraphQL intercept error for ${cat} (attempt ${attempt + 1}): ${err.message}`);
    }
  }

  // Fallback to RSS if no links
  if (links.length === 0) {
    console.log(`  🧩 Using RSS fallback for ${cat}`);
    const rssRecords = await fetchRssFallback(cat);
    if (rssRecords.length > 0) {
      // Enrich and write RSS directly (saves a round trip)
      const rssClean = rssRecords.map((r) => {
        const brand = (r.title || r.slug).split(/\s*[-–—]\s*/)[0]?.trim() || r.slug;
        return { ...r, title: brand };
      });
      const rssEnriched = engine.enrichDeals(rssClean, cat);
      const preview = rssEnriched.slice(0, 3).map((d) => `${d.title} → ${d.seo?.cta || "❌ missing CTA"}`).join("\n  ");
      console.log(`  Preview (${cat} / RSS):\n  ${preview}`);
      writeJson(`appsumo-${cat}.json`, rssEnriched);
      console.log(`✅ Saved ${rssEnriched.length} → data/appsumo-${cat}.json (RSS)`);
      return;
    }
  }

  // Fallback to cache if still no links
  if (links.length === 0) {
    console.log(`  ♻️ Using cached data for ${cat}`);
    const cached = readJsonSafe(`appsumo-${cat}.json`, []);
    writeJson(`appsumo-${cat}.json`, cached);
    console.log(`✅ Saved ${cached.length} → data/appsumo-${cat}.json (cache)`);
    return;
  }

  // Fetch details + enrich
  const raw = await withConcurrency(links.slice(0, MAX_PER_CATEGORY), DETAIL_CONCURRENCY, (url) => fetchProductDetail(url, cat));
  const clean = raw.map((r) => {
    const brand = (r.title || r.slug).split(/\s*[-–—]\s*/)[0]?.trim() || r.slug;
    return { ...r, title: brand };
  });
  const enriched = engine.enrichDeals(clean, cat);
  const preview = enriched.slice(0, 3).map((d) => `${d.title} → ${d.seo?.cta || "❌ missing CTA"}`).join("\n  ");
  console.log(`  Preview (${cat} / GraphQL):\n  ${preview}`);
  writeJson(`appsumo-${cat}.json`, enriched);
  console.log(`✅ Saved ${enriched.length} → data/appsumo-${cat}.json`);
}

// ───────────────────────────────────────────────────────────────────────────────
// Entry
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  const engine = createCtaEngine();
  for (const [cat, listUrl] of Object.entries(CATEGORY_URLS)) {
    try { await buildCategory(engine, cat, listUrl); }
    catch (err) { console.error(`⚠️ Skipped ${cat}:`, err.message); }
  }
  console.log("\n✨ All categories refreshed and enriched with adaptive CTAs + subtitles.");
  console.log("🧭 Next: Run master-cron to regenerate feeds and insight intelligence.");
}
main().catch((err) => { console.error("Fatal updateFeed error:", err); process.exit(1); });
