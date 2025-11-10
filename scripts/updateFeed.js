/**
 * /scripts/updateFeed.js
 * TinmanApps Adaptive Feed Engine v7.2 “Render-Safe No-Browser Edition”
 * ───────────────────────────────────────────────────────────────────────────────
 * ✅ 100% Render-safe (no Puppeteer, no Chrome dependencies)
 * ✅ Discovers products from AppSumo XML sitemaps
 * ✅ Fetches product pages via HTTP to extract OG:title + OG:image
 * ✅ Classifies into silos using keyword scoring
 * ✅ Normalizes & enriches deals using CTA Engine
 * ✅ Preserves historical CTAs/subtitles via merge logic
 * ✅ Archives missing products correctly
 * ✅ MAX_PER_CATEGORY easily adjustable for future “show everything”
 * ✅ Clean, deterministic, non-conflicting with master-cron evolver
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import crypto from "crypto";
import { createCtaEngine, enrichDeals } from "../lib/ctaEngine.js";
import { normalizeFeed } from "../lib/feedNormalizer.js";

// ───────────────────────────────────────────────────────────────────────────────
// Paths & Constants
// ───────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u="; // masked affiliate base

// Tuning — YOU CAN CHANGE THIS ANY TIME
const MAX_PER_CATEGORY = 10;                 // future? set to Infinity to show all
const DETAIL_CONCURRENCY = 8;                // HTTP concurrency
const PRODUCT_URL_HARD_CAP = 500;            // safety guard

// ───────────────────────────────────────────────────────────────────────────────
// Utility Helpers
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

function toSlug(url) {
  const m = url?.match(/\/products\/([^/]+)\//i);
  return m ? m[1] : null;
}

function extractOg(html) {
  const get = (p) =>
    html.match(
      new RegExp(
        `<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']+)["']`,
        "i"
      )
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
  const safeSlug =
    slug ||
    toSlug(url) ||
    (title || "").toLowerCase().replace(/\s+/g, "-");

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
// Silo Classification
// ───────────────────────────────────────────────────────────────────────────────
const SILO_KEYWORDS = {
  ai: [
    " ai",
    "gpt",
    "automation",
    "autopilot",
    "assistant",
    "copilot",
    "bot",
    "agent",
    "llm",
    "chat",
    "voice ai",
  ],
  marketing: [
    "marketing",
    "seo",
    "social",
    "sales",
    "lead",
    "crm",
    "advertising",
    "email",
    "campaign",
    "traffic",
    "growth",
    "conversion",
    "content",
  ],
  courses: [
    "course",
    "academy",
    "training",
    "teach",
    "learn",
    "creator",
    "coach",
    "skill",
    "education",
    "tutorial",
    "lesson",
    "instructor",
    "mentor",
  ],
  productivity: [
    "productivity",
    "task",
    "workflow",
    "project",
    "kanban",
    "time",
    "schedule",
    "calendar",
    "focus",
    "collaboration",
    "team",
    "meeting",
  ],
  business: [
    "accounting",
    "finance",
    "invoice",
    "legal",
    "hr",
    "contract",
    "analytics",
    "report",
    "startup",
    "management",
    "client",
    "agency",
  ],
  web: [
    "builder",
    "website",
    "landing",
    "design",
    "no-code",
    "hosting",
    "frontend",
    "cms",
    "theme",
    "plugin",
    "webapp",
  ],
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
// Sitemap Discovery (XML only, Render-safe)
// ───────────────────────────────────────────────────────────────────────────────
async function discoverProductUrls() {
  const productUrls = new Set();

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

  const urlEntries =
    root?.urlset?.url?.map((u) => u.loc?.[0]).filter(Boolean) || [];
  urlEntries.forEach((u) => toCrawl.add(u));

  [
    "https://appsumo.com/sitemap.xml",
    "https://appsumo.com/sitemap_index.xml",
    "https://appsumo.com/sitemap-products.xml",
    "https://appsumo.com/sitemap-products1.xml",
    "https://appsumo.com/sitemap_products.xml",
    "https://appsumo.com/software/",
  ].forEach((u) => toCrawl.add(u));

  for (const url of Array.from(toCrawl)) {
    if (!/sitemap/i.test(url)) continue;
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
      // continue silently
    }
    if (productUrls.size >= PRODUCT_URL_HARD_CAP) break;
  }

  if (productUrls.size === 0) {
    try {
      const html = await fetchText("https://appsumo.com/software/");
      const matches = Array.from(
        html.matchAll(
          /href=["'](https?:\/\/[^"']*\/products\/[^"']*\/)["']/gi
        )
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
  console.log(`🧭 Discovered ${list.length} product URLs`);
  return list;
}

// ───────────────────────────────────────────────────────────────────────────────
// HTTP Detail Fetch
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
// Merge Logic — preserve CTAs/subtitles
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
// Main Runtime
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  ensureDir(DATA_DIR);

  createCtaEngine();
  console.log("✅ CTA Engine ready");

  console.log("⏳ Discovering AppSumo products…");
  const productUrls = await discoverProductUrls();

  const details = await withConcurrency(
    productUrls,
    DETAIL_CONCURRENCY,
    fetchDetail
  );
  const unique = dedupe(details);
  console.log(`🧩 ${unique.length} unique products resolved`);

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

  for (const [cat, arr] of Object.entries(silos)) {
    if (!arr.length) {
      const cached = readJsonSafe(`appsumo-${cat}.json`, []);
      console.log(`♻️ ${cat}: no fresh items, using cache (${cached.length})`);
      continue;
    }

    let cleaned = normalizeFeed(arr);

    cleaned = cleaned.slice(0, MAX_PER_CATEGORY);

    cleaned = enrichDeals(cleaned, cat);

    const merged = mergeWithHistory(cat, cleaned);

    writeJson(`appsumo-${cat}.json`, merged);

    console.log(`🧹 ${cat}: normalized + merged (${merged.length} entries)`);
  }

  console.log("\n✨ All silos refreshed (v7.2 Render-Safe).");
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
