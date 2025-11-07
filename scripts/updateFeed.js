// /scripts/updateFeed.js
// TinmanApps Adaptive Feed Engine v4.2 — Deep Scroll + Network Idle
// Fixes missing “AI” and “Productivity” results by extending scroll depth and network-idle waits.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
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

const MAX_PER_CATEGORY = 120;
const DETAIL_CONCURRENCY = 8;
const NAV_TIMEOUT_MS = 45000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function writeJson(file, data) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}
function toSlugFromUrl(url) {
  const m = url.match(/\/products\/([^/]+)\//i);
  return m ? m[1] : null;
}
function proxiedImage(src) {
  return `${SITE_ORIGIN}/api/image-proxy?src=${encodeURIComponent(src)}`;
}
function trackedUrl({ slug, cat, url }) {
  const masked = REF_PREFIX + encodeURIComponent(url);
  return `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(
    slug
  )}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(masked)}`;
}
function normalizeRecord({ slug, title, url, cat, image }) {
  const safeSlug =
    slug ||
    toSlugFromUrl(url) ||
    (title ? title.toLowerCase().replace(/\s+/g, "-") : "deal");
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
    const rx = new RegExp(
      `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const m = html.match(rx);
    return m ? m[1] : null;
  };
  return {
    title: get("og:title") || html.match(/<title>([^<]+)<\/title>/i)?.[1] || null,
    image:
      get("og:image") ||
      get("twitter:image") ||
      get("og:image:secure_url") ||
      null,
  };
}
async function fetchText(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--no-zygote",
      "--disable-dev-shm-usage",
    ],
  });
}

// Deep-scroll collector with network-idle waits
async function collectProductLinks(page, listUrl) {
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  let links = new Set(await page.$$eval("a[href*='/products/']", as => as.map(a => a.href)));

  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    try { await page.waitForNetworkIdle({ idleTime: 800, timeout: 4000 }); } catch {}
    const newLinks = await page.$$eval("a[href*='/products/']", as => as.map(a => a.href));
    newLinks.forEach(l => links.add(l));
    if (links.size >= MAX_PER_CATEGORY) break;
  }

  // Fallback: use AppSumo’s API if too few links
  if (links.size < 10) {
    try {
      const catSlug = listUrl.split("/software/")[1]?.replace("/", "") || "software";
      const apiUrl = `https://appsumo.com/api/v2/listing-page/${catSlug || "software"}/`;
      const json = await fetch(apiUrl).then(r => r.json());
      json.results?.forEach((p) => {
        if (p.url) links.add(`https://appsumo.com${p.url}`);
      });
    } catch (err) {
      console.warn("⚠️ API fallback failed:", err.message);
    }
  }

  return Array.from(links)
    .map(u => u.match(/https?:\/\/[^/]+\/products\/[^/#?]+\/?/i)?.[0])
    .filter(Boolean)
    .slice(0, MAX_PER_CATEGORY);
}

async function fetchProductDetail(url, cat) {
  try {
    const html = await fetchText(url);
    const og = extractOg(html);
    const slug = toSlugFromUrl(url);
    return normalizeRecord({
      slug,
      title: og.title || slug,
      url,
      cat,
      image: og.image,
    });
  } catch {
    const slug = toSlugFromUrl(url);
    return normalizeRecord({ slug, title: slug, url, cat, image: null });
  }
}

async function withConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const runners = new Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        try { out[idx] = await worker(items[idx], idx); }
        catch (err) { console.error(`❌ Worker failed on item ${idx}:`, err.message); }
      }
    });
  await Promise.all(runners);
  return out.filter(Boolean);
}

async function buildCategory(engine, cat, listUrl) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  console.log(`\n⏳ Fetching ${cat} → ${listUrl}`);
  const links = await collectProductLinks(page, listUrl);

  const rawRecords = await withConcurrency(
    links,
    DETAIL_CONCURRENCY,
    (url) => fetchProductDetail(url, cat)
  );

  const cleanRecords = rawRecords.map((r) => {
    const parts = (r.title || "").split(/\s*[-–—]\s*/);
    const brand = parts[0]?.trim() || r.slug;
    return { ...r, title: brand };
  });

  const enriched = engine.enrichDeals(cleanRecords, cat);

  const preview = enriched
    .slice(0, 3)
    .map((d) => `${d.title} → ${d.seo?.cta || "❌ missing CTA"}`)
    .join("\n  ");
  console.log(`  Preview (${cat}):\n  ${preview}`);

  writeJson(`appsumo-${cat}.json`, enriched);
  console.log(`✅ Saved ${enriched.length} → data/appsumo-${cat}.json`);

  await page.close();
  await browser.close();
}

async function main() {
  const engine = createCtaEngine();

  for (const [cat, listUrl] of Object.entries(CATEGORY_URLS)) {
    try { await buildCategory(engine, cat, listUrl); }
    catch (err) { console.error(`⚠️ Skipped category ${cat}:`, err.message); }
  }

  console.log("\n✨ All categories refreshed and enriched with adaptive CTAs + subtitles.");
  console.log("🧭 Next: Run master-cron to regenerate feeds and insight intelligence.");
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
