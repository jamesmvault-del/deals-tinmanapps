// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps Adaptive Feed Engine v6.1.1 “Knowledge Expansion”
// • Fixes CTAEngine integration (createCtaEngine instance)
// • Limits per-category items to 10 for faster testing
// • Fully compatible with Hard-Clamp CTA Engine v2.0
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import crypto from "crypto";
import { createCtaEngine } from "../lib/ctaEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// ⚙️ TEST MODE
// Limit for faster render verification (adjust back to 120 after QA)
const MAX_PER_CATEGORY = 10;
const DETAIL_CONCURRENCY = 6;
const NAV_TIMEOUT_MS = 45000;

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function writeJson(f, d) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2));
}
function readJsonSafe(f, fallback = []) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8")); }
  catch { return fallback; }
}
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
function toSlug(url) {
  const m = url?.match(/\/products\/([^/]+)\//i);
  return m ? m[1] : null;
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
function normalize({ slug, title, url, cat, image }) {
  const safe = slug || toSlug(url) || title.toLowerCase().replace(/\s+/g, "-");
  return {
    title: title || safe,
    slug: safe,
    category: cat,
    url,
    referralUrl: tracked({ slug: safe, cat, url }),
    image: image ? proxied(image) : `${SITE_ORIGIN}/assets/placeholder.webp`,
    seo: {
      clickbait:
        cat === "courses"
          ? `Build & sell courses with ${title} — Top learning tool on AppSumo`
          : `Discover ${title} — #1 in ${cat}`,
      keywords:
        cat === "courses"
          ? [
              "courses", "creator", "academy", "teach online",
              "learning platform", "build courses", "AppSumo", safe,
            ]
          : [cat, "AppSumo", "lifetime deal", safe],
    },
  };
}
function dedupe(items) {
  const seen = new Set(); const out = [];
  for (const i of items) {
    const k = sha1(i.slug || i.url || i.title);
    if (!seen.has(k)) { seen.add(k); out.push(i); }
  }
  return out;
}
async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
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

// ───────────────────────────────────────────────────────────────────────────────
// Silo Keywords (intent-based classification)
// ───────────────────────────────────────────────────────────────────────────────
const SILO_KEYWORDS = {
  ai: [
    " ai", "gpt", "automation", "autopilot", "assistant",
    "copilot", "bot", "agent", "llm", "chat", "voice ai"
  ],
  marketing: [
    "marketing", "seo", "social", "sales", "lead", "crm", "advertising",
    "email", "campaign", "traffic", "growth", "conversion", "content"
  ],
  courses: [
    "course", "academy", "training", "teach", "learn", "creator",
    "coach", "skill", "education", "knowledge", "student", "tutorial",
    "class", "lesson", "instructor", "mentor", "teacher", "curriculum"
  ],
  productivity: [
    "productivity", "task", "workflow", "project", "kanban", "time",
    "schedule", "calendar", "focus", "collaboration", "team", "meeting"
  ],
  business: [
    "accounting", "finance", "invoice", "legal", "hr", "contract",
    "analytics", "report", "startup", "management", "client", "agency"
  ],
  web: [
    "builder", "website", "landing", "design", "no-code",
    "hosting", "frontend", "cms", "theme", "plugin", "webapp"
  ],
};

// ───────────────────────────────────────────────────────────────────────────────
// Discover all collections from AppSumo
// ───────────────────────────────────────────────────────────────────────────────
async function discoverCollections() {
  const set = new Set();
  try {
    const xml = await fetchText("https://appsumo.com/sitemap.xml");
    const parsed = await parseStringPromise(xml);
    const urls = parsed?.urlset?.url?.map((u) => u.loc[0]) || [];
    urls.forEach((u) => { if (u.includes("/software/")) set.add(u.replace(/\/$/, "/")); });
  } catch {}
  set.add("https://appsumo.com/software/");
  return Array.from(set).slice(0, 100);
}

// ───────────────────────────────────────────────────────────────────────────────
// Scrape a collection (DOM pass)
// ───────────────────────────────────────────────────────────────────────────────
async function scrapeCollection(url, label) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  let items = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: 1600 }); await sleep(400); }
    items = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/products/"]'));
      const seen = new Set(); const out = [];
      for (const a of anchors) {
        const href = a.getAttribute("href");
        if (!href?.includes("/products/")) continue;
        const abs = new URL(href, location.origin).toString().replace(/\/$/, "/");
        if (seen.has(abs)) continue;
        seen.add(abs);
        let title =
          a.getAttribute("title") ||
          a.textContent ||
          a.querySelector("h2,h3")?.textContent ||
          "";
        title = title.replace(/\s+/g, " ").trim();
        out.push({ url: abs, title });
      }
      return out;
    });
  } catch (err) {
    console.warn(`⚠️ scrape failed for ${label}: ${err.message}`);
  }
  await browser.close();
  console.log(`📥 ${label}: scraped ${items.length} items`);
  return items;
}

// ───────────────────────────────────────────────────────────────────────────────
// Classifier (intent scoring)
// ───────────────────────────────────────────────────────────────────────────────
function classify(title, url) {
  const text = `${title} ${url}`.toLowerCase();
  let best = "software";
  let maxScore = 0;
  for (const [silo, keys] of Object.entries(SILO_KEYWORDS)) {
    let score = 0;
    for (const k of keys) if (text.includes(k)) score++;
    if (score > maxScore) { maxScore = score; best = silo; }
  }
  if (/\/courses?-/.test(url)) best = "courses";
  return best;
}

// ───────────────────────────────────────────────────────────────────────────────
// Fetch details + enrichment
// ───────────────────────────────────────────────────────────────────────────────
async function fetchDetail(item, cat) {
  try {
    const html = await fetchText(item.url);
    const og = extractOg(html);
    const slug = toSlug(item.url);
    return normalize({
      slug,
      title: (og.title || item.title || slug || "").split(/\s*[-–—]\s*/)[0].trim(),
      url: item.url,
      cat,
      image: og.image,
    });
  } catch {
    const slug = toSlug(item.url);
    return normalize({
      slug,
      title: (item.title || slug || "").split(/\s*[-–—]\s*/)[0].trim(),
      url: item.url,
      cat,
      image: null,
    });
  }
}
async function withConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try { out[idx] = await worker(items[idx], idx); }
      catch (err) { console.error(`❌ worker ${idx}:`, err.message); }
    }
  });
  await Promise.all(runners);
  return out.filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────────
// Main Build
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  const engine = createCtaEngine();
  console.log("⏳ Discovering live AppSumo collections…");
  const collections = await discoverCollections();

  const harvested = [];
  for (const url of collections) {
    const label = url.split("/").filter(Boolean).pop();
    const items = await scrapeCollection(url, label);
    for (const it of items) harvested.push({ ...it, source: url });
  }

  const withSlugs = harvested.map((x) => ({ ...x, slug: toSlug(x.url) })).filter((x) => x.slug);
  const unique = dedupe(withSlugs);
  console.log(`🧩 ${unique.length} unique deals harvested.`);

  const silos = {
    ai: [], marketing: [], courses: [], productivity: [],
    business: [], web: [], software: [],
  };
  for (const item of unique) {
    const cat = classify(item.title, item.url);
    silos[cat].push(item);
  }

  for (const [cat, arr] of Object.entries(silos)) {
    let recs = [];
    if (arr.length > 0) {
      const details = await withConcurrency(
        arr.slice(0, MAX_PER_CATEGORY),
        DETAIL_CONCURRENCY,
        (x) => fetchDetail(x, cat)
      );
      recs = dedupe(details);
      recs = engine.enrichDeals(recs, cat);
    } else {
      recs = readJsonSafe(`appsumo-${cat}.json`, []);
      console.log(`  ♻️ ${cat}: using cached data (${recs.length})`);
    }
    const preview = recs
      .slice(0, 3)
      .map((d) => `${d.title} → ${d.seo?.cta || "❌"}`)
      .join("\n  ");
    console.log(`📦 ${cat}: ${recs.length} deals\n  ${preview}`);
    writeJson(`appsumo-${cat}.json`, recs);
  }

  console.log("\n✨ All silos refreshed (v6.1.1 Stable Integration).");
  console.log("🧭 Next: Run master-cron to regenerate feeds and insight intelligence.");
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
