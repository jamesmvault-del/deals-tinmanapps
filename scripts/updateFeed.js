// /scripts/updateFeed.js
// TinmanApps Adaptive Feed Engine v3 — minimal logs, production ready

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

// ───────────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// Categories to crawl
const CATEGORY_URLS = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  productivity: "https://appsumo.com/software/productivity/",
  ai: "https://appsumo.com/software/artificial-intelligence/",
  courses: "https://appsumo.com/courses-more/",
};

// Crawl limits / performance
const MAX_PER_CATEGORY = Number(process.env.MAX_PER_CATEGORY || 120);
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 8);
const NAV_TIMEOUT_MS = 45_000;

// CTA pool (deterministic per slug)
const CTA_POOL = [
  "Save hours every week →",
  "Get instant lifetime access →",
  "Explore what it replaces →",
  "See real user results →",
  "Unlock deal →",
  "Compare to your stack →",
  "Cut costs without compromise →",
  "Automate the boring stuff →",
  "Upgrade your workflow now →",
  "Turn ideas into results →",
  "Level up in minutes →",
  "Discover smarter ways to grow →",
];

// ───────────────────────────────────────────────────────────────────────────────
// Utils
// ───────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJson(file, data) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function hash32(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function ctaFor(slug) {
  return CTA_POOL[hash32(slug) % CTA_POOL.length];
}

function toSlugFromUrl(url) {
  const m = url.match(/\/products\/([^/]+)\//i);
  return m ? m[1] : null;
}

function proxiedImage(src) {
  const u = encodeURIComponent(src);
  return `${SITE_ORIGIN}/api/image-proxy?src=${u}`;
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
      cta: ctaFor(safeSlug),
    },
  };
}

// Minimal OG parser (no extra deps)
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
    title:
      get("og:title") ||
      (html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null),
    image:
      get("og:image") ||
      get("twitter:image") ||
      get("og:image:secure_url") ||
      null,
  };
}

// Fetch with timeout
async function fetchText(url, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Crawlers
// ───────────────────────────────────────────────────────────────────────────────
async function launchBrowser() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--no-zygote",
      "--disable-dev-shm-usage",
    ],
  });
  return browser;
}

async function collectProductLinks(page, listUrl) {
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  // Try to grab a batch immediately; if low count, auto-scroll a bit
  let links = await page.$$eval("a[href*='/products/']", (as) =>
    as.map((a) => a.href)
  );
  if (links.length < 20) {
    // gentle auto-scroll – keep it quick
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.25));
      await sleep(400);
      const more = await page.$$eval("a[href*='/products/']", (as) =>
        as.map((a) => a.href)
      );
      links = [...links, ...more];
      links = [...new Set(links)];
      if (links.length >= MAX_PER_CATEGORY) break;
    }
  }

  // Normalize to unique product URLs
  const products = [...new Set(
    links
      .map((u) => {
        const m = u.match(/https?:\/\/[^/]+\/products\/[^/#?]+\/?/i);
        return m ? m[0].replace(/\/$/, "/") : null;
      })
      .filter(Boolean)
  )];

  return products.slice(0, MAX_PER_CATEGORY);
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
        out[idx] = await worker(items[idx], idx);
      }
    });
  await Promise.all(runners);
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────
async function buildCategory(browser, cat, listUrl) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  const links = await collectProductLinks(page, listUrl);

  const records = await withConcurrency(
    links,
    DETAIL_CONCURRENCY,
    (url) => fetchProductDetail(url, cat)
  );

  writeJson(`appsumo-${cat}.json`, records);
  console.log(`Saved ${records.length} → data/appsumo-${cat}.json`);

  await page.close();
}

async function main() {
  const browser = await launchBrowser();

  try {
    for (const [cat, listUrl] of Object.entries(CATEGORY_URLS)) {
      await buildCategory(browser, cat, listUrl);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
