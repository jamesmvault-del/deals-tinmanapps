// /scripts/updateFeed.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps Adaptive Feed Engine v4.8 — “Category Realignment”
// • Stable parent collections + tag-derived AI/Productivity
// • Headless GraphQL intercept (any /graphql JSON) with tag capture
// • Integrity Lock: dedupe by slug + clean enrichment
// • Triple fallback kept (GraphQL → RSS (where exists) → Cache)
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { createCtaEngine } from "../lib/ctaEngine.js";

// ───────────────────────────────────────────────────────────────────────────────
// Paths & constants
// ───────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

const MAX_PER_CATEGORY = Number(process.env.MAX_PER_CATEGORY || 120);
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 8);
const NAV_TIMEOUT_MS = 45_000;
const HYDRATION_WAIT_MS = Number(process.env.HYDRATION_WAIT_MS || 45_000);

// Canonical parents we open in a headless browser (stable over time)
const PARENT_COLLECTIONS = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  courses: "https://appsumo.com/courses-more/",
  // open these to harvest plenty of payloads for tag-derived cats:
  contentCreation: "https://appsumo.com/software/content-creation/",
  projectManagement: "https://appsumo.com/software/project-management/",
};

// Exported categories we will write (some map directly, some are derived)
const OUTPUT_CATEGORIES = ["software", "marketing", "courses", "ai", "productivity"];

// Legacy RSS (kept if any still respond)
const RSS_FALLBACKS = {
  software: "https://appsumo.com/software/rss/",
  marketing: "https://appsumo.com/software/marketing-sales/rss/",
  courses: "https://appsumo.com/courses-more/rss/",
};

// Tag filters for derived categories
const TAGS = {
  ai: [
    "AI",
    "Artificial Intelligence",
    "GPT",
    "ChatGPT",
    "Automation",
    "Generative AI",
    "AI Tools",
  ],
  productivity: [
    "Productivity",
    "Time Management",
    "Task Management",
    "Project Management",
    "Workflow",
    "Focus",
  ],
};

// ───────────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function writeJson(file, data) { ensureDir(DATA_DIR); fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); }
function readJsonSafe(file, fallback = []) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); } catch { return fallback; } }

function toSlugFromUrl(url) {
  const m = url?.match(/\/products\/([^/]+)\//i);
  return m ? m[1] : null;
}
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
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
  finally { clearTimeout(t); }
}
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
function dedupeBySlug(deals) {
  const seen = new Set(); const out = [];
  for (const d of deals) {
    const k = sha1(d.slug || d.url || d.title || "");
    if (!seen.has(k)) { seen.add(k); out.push(d); }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// GraphQL intercept (generic JSON walker; captures url/title/image/tags)
// ───────────────────────────────────────────────────────────────────────────────
function walkCollect(node, bucket) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const v of node) walkCollect(v, bucket); return; }

  // Heuristic: nodes with { url, title } and url like "/products/.."
  if (typeof node.url === "string" && node.url.startsWith("/products/") && typeof node.title === "string") {
    bucket.add(JSON.stringify({
      url: `https://appsumo.com${node.url}`,
      title: node.title,
      image: node.image || node.thumbnail || node.logo || null,
      tags: (node.tags || node.topics || node.categories || []).map(String),
    }));
  }
  for (const k of Object.keys(node)) walkCollect(node[k], bucket);
}

async function harvestFromParent(parentLabel, parentUrl) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-gpu","--no-zygote","--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();

  const raw = new Set();
  page.on("response", async (res) => {
    const u = res.url();
    if (!u.includes("/graphql")) return;
    const ct = res.headers()["content-type"] || "";
    if (!ct.includes("application/json")) return;
    try {
      const json = await res.json();
      walkCollect(json?.data, raw);
    } catch {}
  });

  await page.goto(parentUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  const start = Date.now();
  while (Date.now() - start < HYDRATION_WAIT_MS && raw.size < 50) {
    await page.mouse.move(120 + Math.random() * 200, 200 + Math.random() * 250);
    await page.mouse.wheel({ deltaY: 1200 });
    await sleep(900 + Math.random() * 500);
  }
  await sleep(1500);

  await page.close();
  await browser.close();

  // Parse set into objects
  const items = Array.from(raw).map((s) => {
    try { return JSON.parse(s); } catch { return null; }
  }).filter(Boolean);

  console.log(`  🧠 ${parentLabel}: harvested ${items.length} nodes via GraphQL`);
  return items;
}

// ───────────────────────────────────────────────────────────────────────────────
// RSS fallback (where available)
// ───────────────────────────────────────────────────────────────────────────────
async function fetchRssFallback(cat) {
  const feed = RSS_FALLBACKS[cat];
  if (!feed) return [];
  try {
    const xml = await fetchText(feed);
    const data = await parseStringPromise(xml);
    const items = data?.rss?.channel?.[0]?.item || [];
    return items.map((it) => {
      const link = it.link?.[0]; const title = it.title?.[0];
      if (!link || !title) return null;
      return { url: link, title, image: null, tags: [] };
    }).filter(Boolean);
  } catch (e) {
    console.warn(`  ⚠️ RSS fallback failed for ${cat}: ${e.message}`);
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Detail fetch + enrichment
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
      try { out[idx] = await worker(items[idx], idx); } catch (err) { console.error(`❌ Worker ${idx} failed:`, err.message); }
    }
  });
  await Promise.all(runners); return out.filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────────
// Build per output category from harvested pool
// ───────────────────────────────────────────────────────────────────────────────
function filterByTags(items, wanted) {
  const needles = wanted.map((t) => t.toLowerCase());
  return items.filter((it) => {
    const tags = Array.isArray(it.tags) ? it.tags.map((x) => String(x).toLowerCase()) : [];
    return tags.some((tg) => needles.some((n) => tg.includes(n)));
  });
}

function itemsToRecords(items, cat) {
  return items.map((i) =>
    normalizeRecord({
      slug: toSlugFromUrl(i.url),
      title: (i.title || "").split(/\s*[-–—]\s*/)[0]?.trim(),
      url: i.url,
      cat,
      image: i.image,
    })
  );
}

async function buildAllCategories() {
  console.log("\n⏳ Harvesting parent collections…");
  const pools = {};
  for (const [label, url] of Object.entries(PARENT_COLLECTIONS)) {
    pools[label] = await harvestFromParent(label, url);
  }

  // Consolidate “software baseline” = software + contentCreation + projectManagement
  const softwarePool = dedupeBySlug(
    pools.software
      .concat(pools.contentCreation || [])
      .concat(pools.projectManagement || [])
      .map((x) => ({ ...x, slug: toSlugFromUrl(x.url) }))
      .filter((x) => x.slug)
  );

  // Direct outputs
  const out = {
    software: itemsToRecords(softwarePool.slice(0, MAX_PER_CATEGORY), "software"),
    marketing: itemsToRecords(dedupeBySlug((pools.marketing || []).map((x) => ({ ...x, slug: toSlugFromUrl(x.url) }))).slice(0, MAX_PER_CATEGORY), "marketing"),
    courses: itemsToRecords(dedupeBySlug((pools.courses || []).map((x) => ({ ...x, slug: toSlugFromUrl(x.url) }))).slice(0, MAX_PER_CATEGORY), "courses"),
  };

  // Derived by tags from the union pool
  const unionPool = softwarePool
    .concat(pools.marketing || [])
    .concat(pools.courses || []);
  const aiItems = filterByTags(unionPool, TAGS.ai);
  const prodItems = filterByTags(unionPool, TAGS.productivity);

  out.ai = itemsToRecords(dedupeBySlug(aiItems).slice(0, MAX_PER_CATEGORY), "ai");
  out.productivity = itemsToRecords(dedupeBySlug(prodItems).slice(0, MAX_PER_CATEGORY), "productivity");

  // If any pool is empty (e.g., courses/ai), try RSS then cache
  for (const cat of OUTPUT_CATEGORIES) {
    if ((out[cat] || []).length === 0) {
      console.log(`  🧩 Using RSS/cache fallback for ${cat}`);
      const rss = await fetchRssFallback(cat);
      if (rss.length) {
        out[cat] = itemsToRecords(dedupeBySlug(rss.map((x) => ({ ...x, slug: toSlugFromUrl(x.url) }))).slice(0, MAX_PER_CATEGORY), cat);
      } else {
        out[cat] = readJsonSafe(`appsumo-${cat}.json`, []);
      }
    }
  }

  // Enrich + save each
  const engine = createCtaEngine();
  for (const cat of OUTPUT_CATEGORIES) {
    const clean = dedupeBySlug(out[cat] || []);
    const enriched = engine.enrichDeals(clean, cat);
    const preview = enriched.slice(0, 3).map((d) => `${d.title} → ${d.seo?.cta || "❌ missing CTA"}`).join("\n  ");
    console.log(`\n📦 ${cat}: ${enriched.length} deals\n  ${preview}`);
    writeJson(`appsumo-${cat}.json`, enriched);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Entrypoint
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  try {
    await buildAllCategories();
    console.log("\n✨ All categories refreshed (realigned + tag-derived) with adaptive CTAs.");
    console.log("🧭 Next: Run master-cron to regenerate feeds and insight intelligence.");
  } catch (err) {
    console.error("Fatal updateFeed error:", err);
    process.exit(1);
  }
}
main();
