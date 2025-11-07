// /scripts/updateFeed.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps Adaptive Feed Engine v4.9 — “Resilient DOM Hybrid”
//
// • Primary: GraphQL intercept (any /graphql JSON) on stable parent collections
// • Fallback: Resilient DOM scraping of product cards (anchors → /products/...)
// • Detail fetch: OG title/image + heuristic tag extraction (JSON-LD, meta keywords)
// • Derived categories: AI & Productivity via tag/keyword filters
// • Integrity Lock: dedupe by slug; CTA/subtitle enrichment preserved
// • Triple fallback retained (GraphQL → DOM → RSS (where exists) → Cache)
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

const MAX_PER_CATEGORY = Number(process.env.MAX_PER_CATEGORY || 120);
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 8);
const NAV_TIMEOUT_MS = 45_000;
const HYDRATION_WAIT_MS = Number(process.env.HYDRATION_WAIT_MS || 45_000);

// Canonical parents (stable surfacing)
const PARENT_COLLECTIONS = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  courses: "https://appsumo.com/courses-more/",
  contentCreation: "https://appsumo.com/software/content-creation/",
  projectManagement: "https://appsumo.com/software/project-management/",
  workflow: "https://appsumo.com/software/workflow-automation/",
  taskManagement: "https://appsumo.com/software/task-management/",
  organization: "https://appsumo.com/software/organization/",
  remoteWork: "https://appsumo.com/software/remote-work/",
};

// Output categories (software/marketing/courses are direct; ai/productivity are derived)
const OUTPUT_CATEGORIES = ["software", "marketing", "courses", "ai", "productivity"];

// Legacy RSS (some may be dead; keep as last-resort)
const RSS_FALLBACKS = {
  software: "https://appsumo.com/software/rss/",
  marketing: "https://appsumo.com/software/marketing-sales/rss/",
  courses: "https://appsumo.com/courses-more/rss/",
};

// Tag filters + keyword heuristics
const TAGS = {
  ai: [
    "AI", "Artificial Intelligence", "GPT", "ChatGPT", "Automation",
    "Generative AI", "AI Tools", "LLM", "Autopilot", "Agent"
  ],
  productivity: [
    "Productivity", "Time Management", "Task Management", "Project Management",
    "Workflow", "Focus", "To-Do", "Kanban", "Calendar"
  ],
};
const KW = {
  ai: ["ai", "gpt", "chatgpt", "automation", "autopilot", "agent", "llm", "generative"],
  productivity: ["productivity", "time management", "task", "project", "workflow", "focus", "kanban", "calendar"]
};

// ───────────────────────────────────────────────────────────────────────────────
// Utils
// ───────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function writeJson(file, data) { ensureDir(DATA_DIR); fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); }
function readJsonSafe(file, fallback = []) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); } catch { return fallback; } }
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }

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
function dedupeBySlug(items) {
  const seen = new Set(); const out = [];
  for (const it of items) {
    const key = sha1(it.slug || it.url || it.title || "");
    if (!seen.has(key)) { seen.add(key); out.push(it); }
  }
  return out;
}

async function fetchText(url, timeoutMs = 25_000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
  finally { clearTimeout(t); }
}
function extractOg(html) {
  const get = (prop) => {
    const rx = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
    const m = html.match(rx); return m ? m[1] : null;
  };
  return {
    title: get("og:title") || html.match(/<title>([^<]+)<\/title>/i)?.[1] || null,
    image: get("og:image") || get("twitter:image") || get("og:image:secure_url") || null,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Heuristic tag extraction from detail HTML
// ───────────────────────────────────────────────────────────────────────────────
function extractTagsFromHtml(html) {
  const tags = new Set();

  // 1) JSON-LD blocks
  const ldBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldBlocks) {
    try {
      const obj = JSON.parse(m[1]);
      const walk = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (typeof node.keywords === "string") node.keywords.split(/[,\|]/).forEach(k => tags.add(k.trim()));
        if (Array.isArray(node.keywords)) node.keywords.forEach(k => tags.add(String(k).trim()));
        if (typeof node.applicationCategory === "string") tags.add(node.applicationCategory.trim());
        if (Array.isArray(node.genre)) node.genre.forEach(g => tags.add(String(g).trim()));
        Object.values(node).forEach(walk);
      };
      walk(obj);
    } catch {}
  }

  // 2) meta keywords
  const kw = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (kw) kw.split(/[,\|]/).forEach(k => tags.add(k.trim()));

  // 3) Inline JSON hints (e.g., "tags":[...])
  const inlineTags = [...html.matchAll(/"tags"\s*:\s*\[(.*?)\]/gi)];
  for (const m of inlineTags) {
    m[1].split(",").forEach(x => {
      const val = x.replace(/["'\[\]]/g, "").trim();
      if (val) tags.add(val);
    });
  }

  // 4) Link-based tag chips
  const chipLinks = [...html.matchAll(/<a[^>]+href=["'][^"']*\/tags\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
  chipLinks.forEach(m => tags.add(m[1].replace(/<[^>]+>/g, "").trim()));

  return Array.from(tags).filter(Boolean).slice(0, 20);
}

function isMatchByTagsOrTitle(item, wantedTags) {
  const needles = wantedTags.map(t => t.toLowerCase());
  const title = (item.title || "").toLowerCase();
  const tags = (item.tags || []).map(t => String(t).toLowerCase());
  const hasTag = tags.some(t => needles.some(n => t.includes(n)));
  const hasKw = needles.some(n => title.includes(n));
  return hasTag || hasKw;
}

// ───────────────────────────────────────────────────────────────────────────────
// GraphQL intercept (generic walker)
// ───────────────────────────────────────────────────────────────────────────────
function walkCollect(node, bucket) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach(v => walkCollect(v, bucket)); return; }
  if (typeof node.url === "string" && node.url.startsWith("/products/") && typeof node.title === "string") {
    bucket.add(JSON.stringify({
      url: `https://appsumo.com${node.url}`,
      title: node.title,
      image: node.image || node.thumbnail || node.logo || null,
      tags: (node.tags || node.topics || node.categories || []).map(String),
    }));
  }
  Object.values(node).forEach(v => walkCollect(v, bucket));
}

async function harvestGraphQL(parentLabel, parentUrl, page) {
  const raw = new Set();
  page.on("response", async (res) => {
    const u = res.url(); if (!u.includes("/graphql")) return;
    const ct = res.headers()["content-type"] || ""; if (!ct.includes("application/json")) return;
    try { const json = await res.json(); walkCollect(json?.data, raw); } catch {}
  });
  await page.goto(parentUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  const start = Date.now();
  while (Date.now() - start < HYDRATION_WAIT_MS && raw.size < 50) {
    await page.mouse.move(140 + Math.random()*260, 220 + Math.random()*280);
    await page.mouse.wheel({ deltaY: 1200 });
    await sleep(900 + Math.random()*600);
  }
  await sleep(1200);
  const items = Array.from(raw).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  console.log(`  🧠 ${parentLabel}: GraphQL captured ${items.length} nodes`);
  return items;
}

// ───────────────────────────────────────────────────────────────────────────────
// DOM fallback: scrape anchors + nearest text as title (best-effort)
// ───────────────────────────────────────────────────────────────────────────────
async function harvestDOM(parentLabel, parentUrl, page) {
  await page.goto(parentUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  // aggressive scroll to trigger lazy cards
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel({ deltaY: 1400 });
    await sleep(500);
  }
  // collect anchors to product pages and try to grab card titles
  const items = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/products/"]'));
    const seen = new Set();
    const out = [];
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/products\/[^/]+\/?/i);
      if (!m) continue;
      const abs = new URL(href, location.origin).toString().replace(/\/$/, "/");
      if (seen.has(abs)) continue; seen.add(abs);
      // title: look for text within card
      let title = a.getAttribute("title") || a.textContent || "";
      title = title.replace(/\s+/g, " ").trim();
      if (!title) {
        const card = a.closest("article,div,li,section") || a.parentElement;
        if (card) {
          const h = card.querySelector("h2,h3,h4,.title,[data-title]");
          if (h) title = (h.textContent || "").replace(/\s+/g, " ").trim();
        }
      }
      out.push({ url: abs, title, image: null, tags: [] });
    }
    return out;
  });
  console.log(`  📜 ${parentLabel}: DOM scraped ${items.length} items`);
  return items;
}

// ───────────────────────────────────────────────────────────────────────────────
// Harvest one parent (GraphQL first, then DOM)
// ───────────────────────────────────────────────────────────────────────────────
async function harvestFromParent(parentLabel, parentUrl) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-gpu","--no-zygote","--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();

  let items = await harvestGraphQL(parentLabel, parentUrl, page);
  if (items.length === 0) {
    items = await harvestDOM(parentLabel, parentUrl, page);
  }

  await page.close();
  await browser.close();
  return items;
}

// ───────────────────────────────────────────────────────────────────────────────
// RSS fallback (if any respond)
// ───────────────────────────────────────────────────────────────────────────────
async function fetchRssFallback(cat) {
  const url = RSS_FALLBACKS[cat];
  if (!url) return [];
  try {
    const xml = await fetchText(url);
    const data = await parseStringPromise(xml);
    const items = data?.rss?.channel?.[0]?.item || [];
    return items.map(it => ({ url: it.link?.[0], title: it.title?.[0], image: null, tags: [] }))
      .filter(x => x.url && x.title);
  } catch (e) {
    console.warn(`  ⚠️ RSS fallback failed for ${cat}: ${e.message}`);
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Detail fetch + enrichment
// ───────────────────────────────────────────────────────────────────────────────
async function fetchProductDetail(item, cat) {
  try {
    const html = await fetchText(item.url);
    const og = extractOg(html);
    const tags = extractTagsFromHtml(html);
    const slug = toSlugFromUrl(item.url);
    return normalizeRecord({
      slug,
      title: (og.title || item.title || slug || "").split(/\s*[-–—]\s*/)[0]?.trim(),
      url: item.url,
      cat,
      image: og.image,
    });
  } catch {
    const slug = toSlugFromUrl(item.url);
    return normalizeRecord({
      slug,
      title: (item.title || slug || "").split(/\s*[-–—]\s*/)[0]?.trim(),
      url: item.url,
      cat,
      image: null,
    });
  }
}

async function withConcurrency(items, limit, worker) {
  const out = new Array(items.length); let i = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++; if (idx >= items.length) return;
      try { out[idx] = await worker(items[idx], idx); }
      catch (err) { console.error(`❌ Worker ${idx} failed:`, err.message); }
    }
  });
  await Promise.all(runners);
  return out.filter(Boolean);
}

function itemsToRecords(items, cat) {
  return items.map(i =>
    normalizeRecord({
      slug: toSlugFromUrl(i.url),
      title: (i.title || "").split(/\s*[-–—]\s*/)[0]?.trim(),
      url: i.url,
      cat,
      image: i.image,
    })
  );
}

function matchSet(items, wantedTags, wantedKw) {
  return items.filter(it => isMatchByTagsOrTitle(it, wantedTags) || isMatchByTagsOrTitle({ ...it, title: it.title }, wantedKw));
}

// ───────────────────────────────────────────────────────────────────────────────
// Main build
// ───────────────────────────────────────────────────────────────────────────────
async function buildAllCategories() {
  console.log("\n⏳ Harvesting parent collections…");
  const pools = {};
  for (const [label, url] of Object.entries(PARENT_COLLECTIONS)) {
    pools[label] = await harvestFromParent(label, url);
  }

  // Build union pools with slugs for dedupe
  const poolWithSlugs = (arr) =>
    arr.map(x => ({ ...x, slug: toSlugFromUrl(x.url) })).filter(x => x.slug);

  const softwareUnion = dedupeBySlug(
    poolWithSlugs((pools.software || []))
      .concat(poolWithSlugs(pools.contentCreation || []))
      .concat(poolWithSlugs(pools.projectManagement || []))
  );

  const marketingPool = dedupeBySlug(poolWithSlugs(pools.marketing || []));
  const coursesPool = dedupeBySlug(poolWithSlugs(pools.courses || []));

  // Derived categories via tags/keywords
  const unionForDerived = softwareUnion.concat(marketingPool).concat(coursesPool);
  const aiPool = dedupeBySlug(
    unionForDerived.filter(it => isMatchByTagsOrTitle({ ...it, tags: it.tags || [] }, TAGS.ai) ||
      KW.ai.some(k => (it.title || "").toLowerCase().includes(k)))
  );
  const prodPool = dedupeBySlug(
    unionForDerived.filter(it => isMatchByTagsOrTitle({ ...it, tags: it.tags || [] }, TAGS.productivity) ||
      KW.productivity.some(k => (it.title || "").toLowerCase().includes(k)))
  );

  // Convert to records per category
  const out = {
    software: itemsToRecords(softwareUnion.slice(0, MAX_PER_CATEGORY), "software"),
    marketing: itemsToRecords(marketingPool.slice(0, MAX_PER_CATEGORY), "marketing"),
    courses: itemsToRecords(coursesPool.slice(0, MAX_PER_CATEGORY), "courses"),
    ai: itemsToRecords(aiPool.slice(0, MAX_PER_CATEGORY), "ai"),
    productivity: itemsToRecords(prodPool.slice(0, MAX_PER_CATEGORY), "productivity"),
  };

  // If any empty, try RSS then cache
  for (const cat of OUTPUT_CATEGORIES) {
    if ((out[cat] || []).length === 0) {
      console.log(`  🧩 Using RSS/cache fallback for ${cat}`);
      const rss = await fetchRssFallback(cat);
      if (rss.length) out[cat] = itemsToRecords(dedupeBySlug(poolWithSlugs(rss)).slice(0, MAX_PER_CATEGORY), cat);
      if ((out[cat] || []).length === 0) out[cat] = readJsonSafe(`appsumo-${cat}.json`, []);
    }
  }

  // Detail fetch + enrichment
  const engine = createCtaEngine();
  for (const cat of OUTPUT_CATEGORIES) {
    const detailed = await withConcurrency(out[cat].slice(0, MAX_PER_CATEGORY), DETAIL_CONCURRENCY, (rec) =>
      fetchProductDetail({ url: rec.url, title: rec.title }, cat)
    );
    const clean = dedupeBySlug(detailed);
    const enriched = engine.enrichDeals(clean, cat);
    const preview = enriched.slice(0, 3).map(d => `${d.title} → ${d.seo?.cta || "❌ missing CTA"}`).join("\n  ");
    console.log(`\n📦 ${cat}: ${enriched.length} deals\n  ${preview}`);
    writeJson(`appsumo-${cat}.json`, enriched);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Entry
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  try {
    await buildAllCategories();
    console.log("\n✨ All categories refreshed (GraphQL+DOM hybrid) with adaptive CTAs.");
    console.log("🧭 Next: Run master-cron to regenerate feeds and insight intelligence.");
  } catch (err) {
    console.error("Fatal updateFeed error:", err);
    process.exit(1);
  }
}
main();
