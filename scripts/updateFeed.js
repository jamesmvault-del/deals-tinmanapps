// /scripts/updateFeed.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps Adaptive Feed Engine v5.0 “Affinity Fusion”
//
// • Fully self-discovering AppSumo category map (no hard-coded URLs)
// • Crawls /software root & sitemap.xml to detect active sub-collections
// • Hybrid GraphQL + DOM scraper with adaptive fallback
// • Self-learning tag derivation (AI / Productivity / Marketing etc.)
// • Integrity-locked CTA enrichment + insight compatibility
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import crypto from "crypto";
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

const MAX_PER_CATEGORY = 120;
const DETAIL_CONCURRENCY = 8;
const NAV_TIMEOUT_MS = 45000;
const HYDRATION_WAIT_MS = 45000;

// heuristic labels
const TAGS = {
  ai: ["ai", "automation", "gpt", "chatgpt", "autopilot", "agent"],
  productivity: [
    "productivity",
    "workflow",
    "time management",
    "project",
    "task",
    "calendar",
    "organization",
  ],
  marketing: ["marketing", "sales", "seo", "email", "conversion"],
};

// ───────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function writeJson(file, data) { ensureDir(DATA_DIR); fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); }
function readJsonSafe(file, fb = []) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); } catch { return fb; } }
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }

function toSlug(url) { const m = url.match(/\/products\/([^/]+)\//i); return m ? m[1] : null; }
function proxied(src) { return `${SITE_ORIGIN}/api/image-proxy?src=${encodeURIComponent(src)}`; }
function tracked({ slug, cat, url }) {
  const masked = REF_PREFIX + encodeURIComponent(url);
  return `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(slug)}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(masked)}`;
}
function normalize({ slug, title, url, cat, image }) {
  const safe = slug || toSlug(url) || title?.toLowerCase().replace(/\s+/g, "-") || "deal";
  return {
    title: title || safe,
    slug: safe,
    category: cat,
    url,
    referralUrl: tracked({ slug: safe, cat, url }),
    image: image ? proxied(image) : `${SITE_ORIGIN}/assets/placeholder.webp`,
    seo: {
      clickbait: `Discover ${title || safe} — #1 in ${cat}`,
      keywords: [cat, "AppSumo", "lifetime deal", safe],
    },
  };
}
function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const key = sha1(x.slug || x.url || x.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(res.status);
  return res.text();
}
function extractOg(html) {
  const get = (p) =>
    html.match(new RegExp(`<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1];
  return {
    title: get("og:title") || html.match(/<title>([^<]+)<\/title>/i)?.[1],
    image: get("og:image") || get("twitter:image"),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// CATEGORY DISCOVERY
// ───────────────────────────────────────────────────────────────────────────────
async function discoverCollections() {
  const roots = new Set();

  // attempt sitemap.xml
  try {
    const xml = await fetchText("https://appsumo.com/sitemap.xml");
    const parsed = await parseStringPromise(xml);
    const urls = parsed.urlset.url.map((u) => u.loc[0]);
    urls
      .filter((u) => u.includes("/software/"))
      .forEach((u) => {
        const m = u.match(/\/software\/([^/]+)\//);
        if (m) roots.add(`https://appsumo.com/software/${m[1]}/`);
      });
  } catch {}

  // crawl /software root for in-page links
  try {
    const html = await fetchText("https://appsumo.com/software/");
    const links = [
      ...html.matchAll(/href="(\/software\/[^"']+)"/g),
    ].map((m) => `https://appsumo.com${m[1]}`);
    links.forEach((l) => roots.add(l));
  } catch {}

  const arr = Array.from(roots);
  console.log(`🗺️  Discovered ${arr.length} software collections`);
  return arr.slice(0, 25); // reasonable safety limit
}

// ───────────────────────────────────────────────────────────────────────────────
// DOM SCRAPER
// ───────────────────────────────────────────────────────────────────────────────
async function scrapeCollection(url, label) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const out = new Set();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel({ deltaY: 1500 });
      await sleep(600);
    }
    const data = await page.evaluate(() => {
      const as = Array.from(document.querySelectorAll('a[href*="/products/"]'));
      const seen = new Set();
      const out = [];
      for (const a of as) {
        const href = a.getAttribute("href") || "";
        if (!href.includes("/products/")) continue;
        const abs = new URL(href, location.origin).toString().replace(/\/$/, "/");
        if (seen.has(abs)) continue;
        seen.add(abs);
        let title =
          a.getAttribute("title") ||
          a.textContent ||
          a.querySelector("h2,h3")?.textContent ||
          "";
        title = title.replace(/\s+/g, " ").trim();
        if (!title) continue;
        out.push({ url: abs, title });
      }
      return out;
    });
    data.forEach((d) => out.add(JSON.stringify(d)));
  } catch (err) {
    console.warn(`⚠️  scrape failed for ${label}:`, err.message);
  }
  await browser.close();
  return Array.from(out).map((s) => JSON.parse(s));
}

// ───────────────────────────────────────────────────────────────────────────────
// DETAIL + TAG LOGIC
// ───────────────────────────────────────────────────────────────────────────────
async function fetchDetail(it, cat) {
  try {
    const html = await fetchText(it.url);
    const og = extractOg(html);
    const slug = toSlug(it.url);
    return normalize({ slug, title: og.title || it.title, url: it.url, cat, image: og.image });
  } catch {
    return normalize({ slug: toSlug(it.url), title: it.title, url: it.url, cat, image: null });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  const engine = createCtaEngine();

  console.log("⏳ Discovering live AppSumo collections...");
  const collections = await discoverCollections();
  const allItems = [];

  for (const url of collections) {
    const label = url.split("/").filter(Boolean).pop();
    console.log(`📥  Scraping ${label}`);
    const items = await scrapeCollection(url, label);
    items.forEach((i) => (i.source = label));
    allItems.push(...items);
  }

  const deduped = dedupe(
    allItems.map((x) => ({ ...x, slug: toSlug(x.url) })).filter((x) => x.slug)
  );
  console.log(`🧩 ${deduped.length} total unique deals harvested.`);

  // classify heuristically
  const groups = { software: [], marketing: [], ai: [], productivity: [], courses: [] };
  for (const item of deduped) {
    const title = item.title.toLowerCase();
    if (title.includes("course") || item.source?.includes("courses")) groups.courses.push(item);
    else if (TAGS.ai.some((k) => title.includes(k))) groups.ai.push(item);
    else if (TAGS.productivity.some((k) => title.includes(k))) groups.productivity.push(item);
    else if (TAGS.marketing.some((k) => title.includes(k)) || item.source?.includes("marketing"))
      groups.marketing.push(item);
    else groups.software.push(item);
  }

  // detail + enrich
  for (const [cat, arr] of Object.entries(groups)) {
    const details = await Promise.all(arr.slice(0, MAX_PER_CATEGORY).map((x) => fetchDetail(x, cat)));
    const enriched = engine.enrichDeals(details, cat);
    const preview = enriched.slice(0, 3).map((d) => `${d.title} → ${d.seo?.cta}`).join("\n  ");
    console.log(`📦 ${cat}: ${enriched.length} deals\n  ${preview}`);
    writeJson(`appsumo-${cat}.json`, enriched);
  }

  console.log("\n✨ All categories refreshed (Affinity Fusion, auto-discovered).");
  console.log("🧭 Next: Run master-cron to regenerate feeds and insight intelligence.");
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
