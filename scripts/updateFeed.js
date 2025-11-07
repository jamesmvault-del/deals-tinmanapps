// /scripts/updateFeed.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps Adaptive Feed Engine v5.1 “Taxonomy Lock”
//
// Goal: keep the self-discovering crawler, but make category assignment
// deterministic and aligned with your 5 real TinmanApps categories.
//
// • Auto-discovers AppSumo sub-collections (from sitemap + /software/ page)
// • Scrapes each collection via DOM (since GraphQL is often 0 now)
// • Classifies deals FIRST by the source path (the collection URL it came from)
// • THEN by AI/Productivity keyword heuristics (secondary, never primary)
// • Dedupes by slug (Integrity Lock)
// • Enriches with CTA engine (the one we already upgraded)
// • Falls back to existing cached JSON if a bucket ends up empty
// • 100% compatible with /api/categories/[cat] and master-cron
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

// your render origin
const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

const MAX_PER_CATEGORY = 120;
const DETAIL_CONCURRENCY = 8;
const NAV_TIMEOUT_MS = 45_000;
const HYDRATION_WAIT_MS = 45_000;

// ───────────────────────────────────────────────────────────────────────────────
// 1. Utility helpers
// ───────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const safe =
    slug ||
    toSlug(url) ||
    (title ? title.toLowerCase().replace(/\s+/g, "-") : "deal");
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
function dedupeBySlug(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = sha1(it.slug || it.url || it.title);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
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

// ───────────────────────────────────────────────────────────────────────────────
// 2. Taxonomy: map AppSumo path → our 5 categories
// ───────────────────────────────────────────────────────────────────────────────
//
// We prioritise *path* over *keywords* because AppSumo’s naming is drifting.
// You can tweak this map over time without changing the rest of the file.
//
const PATH_MAP = {
  // marketing cluster
  "software/marketing-sales": "marketing",
  "software/content-marketing": "marketing",
  "software/lead-generation": "marketing",
  "software/email-marketing": "marketing",
  "software/social-proof": "marketing",
  "software/crm": "marketing",
  "software/media-tools": "marketing",
  "software/media-management": "marketing",

  // courses
  "courses-more": "courses",
  "software/course-builders": "courses",

  // productivity cluster
  "software/project-management": "productivity",
  "software/calendar-scheduling": "productivity",
  "software/productivity": "productivity",
  "software/operations": "productivity",
  "software/customer-experience": "productivity",
  "software/workflow-automation": "productivity",
  "software/task-management": "productivity",
  "software/organization": "productivity",
  "software/remote-work": "productivity",

  // ai cluster (rarely surfaced now, so keep as hint)
  "software/artificial-intelligence": "ai",
  "software/ai": "ai",
  "software/automation": "ai",
};

// secondary heuristics – only used if path is unknown
const AI_KEYWORDS = [
  " ai",
  "gpt",
  "chatgpt",
  "automation",
  "autopilot",
  "agent",
  "llm",
];
const PRODUCTIVITY_KEYWORDS = [
  "productivity",
  "project",
  "task",
  "kanban",
  "calendar",
  "workflow",
  "time management",
];

// ───────────────────────────────────────────────────────────────────────────────
// 3. Discover collections (v5.1): sitemap + /software/
// ───────────────────────────────────────────────────────────────────────────────
async function discoverCollections() {
  const found = new Set();

  // 1) sitemap
  try {
    const xml = await fetchText("https://appsumo.com/sitemap.xml");
    const parsed = await parseStringPromise(xml);
    const urls = parsed?.urlset?.url?.map((u) => u.loc[0]) || [];
    for (const u of urls) {
      if (u.includes("/software/")) {
        // normalise to trailing slash
        found.add(u.replace(/\/$/, "/"));
      } else if (u.includes("/courses-more/")) {
        found.add("https://appsumo.com/courses-more/");
      }
    }
  } catch {
    // ignore
  }

  // 2) /software/ page
  try {
    const html = await fetchText("https://appsumo.com/software/");
    const links = [
      ...html.matchAll(/href="(\/software\/[^"']+)"/g),
    ].map((m) => `https://appsumo.com${m[1]}`);
    links.forEach((l) => found.add(l.replace(/\/$/, "/")));
  } catch {
    // ignore
  }

  // 3) force-add the known good ones (safety net)
  found.add("https://appsumo.com/software/");
  found.add("https://appsumo.com/software/marketing-sales/");
  found.add("https://appsumo.com/courses-more/");

  const arr = Array.from(found);
  console.log(`🗺️  Discovered ${arr.length} collections (raw)`);
  // cap to something reasonable
  return arr.slice(0, 35);
}

// ───────────────────────────────────────────────────────────────────────────────
// 4. Scrape one collection (DOM-first, since GraphQL is unreliable now)
// ───────────────────────────────────────────────────────────────────────────────
async function scrapeCollection(url, label) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
  });
  const page = await browser.newPage();

  let items = [];
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });

    // scroll to trigger lazy load
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel({ deltaY: 1600 });
      await sleep(500);
    }

    items = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll('a[href*="/products/"]')
      );
      const seen = new Set();
      const out = [];
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (!href.includes("/products/")) continue;
        const abs = new URL(href, location.origin).toString().replace(/\/$/, "/");
        if (seen.has(abs)) continue;
        seen.add(abs);

        // find name
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
    console.warn(`⚠️  scrape failed for ${label}: ${err.message}`);
  }

  await browser.close();
  console.log(`📥  ${label}: scraped ${items.length} items`);
  return items;
}

// ───────────────────────────────────────────────────────────────────────────────
// 5. Path-based classifier
// ───────────────────────────────────────────────────────────────────────────────
function sourceToCategory(sourceUrl, title = "") {
  // sourceUrl like "https://appsumo.com/software/marketing-sales/"
  // extract slug part: "software/marketing-sales"
  try {
    const u = new URL(sourceUrl);
    const path = u.pathname.replace(/^\/+|\/+$/g, ""); // "software/marketing-sales"
    const key = path.toLowerCase();
    if (PATH_MAP[key]) return PATH_MAP[key];
  } catch {
    // ignore
  }

  // if not in PATH_MAP, then try heuristics on the URL string
  const lower = sourceUrl.toLowerCase();
  if (lower.includes("marketing")) return "marketing";
  if (lower.includes("course")) return "courses";
  if (lower.includes("project-management")) return "productivity";
  if (lower.includes("calendar")) return "productivity";
  if (lower.includes("productivity")) return "productivity";
  if (lower.includes("ai") || lower.includes("automation")) return "ai";

  // title-based secondary
  const t = title.toLowerCase();
  if (AI_KEYWORDS.some((k) => t.includes(k.trim()))) return "ai";
  if (PRODUCTIVITY_KEYWORDS.some((k) => t.includes(k.trim())))
    return "productivity";
  if (t.includes("course") || t.includes("academy") || t.includes("training"))
    return "courses";
  if (t.includes("marketing") || t.includes("leads") || t.includes("crm"))
    return "marketing";

  return "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// 6. Detail fetch (for OG title/image)
// ───────────────────────────────────────────────────────────────────────────────
async function fetchDetail(item, cat) {
  try {
    const html = await fetchText(item.url);
    const og = extractOg(html);
    const slug = toSlug(item.url);
    return normalize({
      slug,
      title: (og.title || item.title || slug || "")
        .split(/\s*[-–—]\s*/)[0]
        .trim(),
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
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(
    async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        try {
          out[idx] = await worker(items[idx], idx);
        } catch (err) {
          console.error(`❌ worker failed on ${idx}:`, err.message);
        }
      }
    }
  );
  await Promise.all(runners);
  return out.filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────────
// 7. Main build
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  const engine = createCtaEngine();

  console.log("⏳ Discovering live AppSumo collections…");
  const collections = await discoverCollections();

  const harvested = [];
  for (const url of collections) {
    const label = url.split("/").filter(Boolean).pop();
    const items = await scrapeCollection(url, label);
    for (const it of items) {
      harvested.push({
        ...it,
        source: url, // keep full URL for classification
      });
    }
  }

  // now we have a big flat list
  const withSlugs = harvested
    .map((x) => ({
      ...x,
      slug: toSlug(x.url),
    }))
    .filter((x) => x.slug);

  const uniqueItems = dedupeBySlug(withSlugs);
  console.log(`🧩 ${uniqueItems.length} unique deals harvested total.`);

  // classify into our 5 buckets
  const buckets = {
    software: [],
    marketing: [],
    courses: [],
    ai: [],
    productivity: [],
  };

  for (const item of uniqueItems) {
    const cat = sourceToCategory(item.source, item.title);
    (buckets[cat] || buckets.software).push(item);
  }

  // fetch detail + enrich per bucket
  for (const [cat, arr] of Object.entries(buckets)) {
    let records = [];
    if (arr.length > 0) {
      const details = await withConcurrency(
        arr.slice(0, MAX_PER_CATEGORY),
        DETAIL_CONCURRENCY,
        (x) => fetchDetail(x, cat)
      );
      records = dedupeBySlug(details);
      records = engine.enrichDeals(records, cat);
    } else {
      // fallback to cache if scraper got nothing for that cat
      records = readJsonSafe(`appsumo-${cat}.json`, []);
      console.log(`  ♻️ ${cat}: using cached data (${records.length})`);
    }

    const preview = records
      .slice(0, 3)
      .map((d) => `${d.title} → ${d.seo?.cta || "❌"}`)
      .join("\n  ");
    console.log(`📦 ${cat}: ${records.length} deals\n  ${preview}`);

    writeJson(`appsumo-${cat}.json`, records);
  }

  console.log("\n✨ All categories refreshed (Taxonomy Lock v5.1).");
  console.log("🧭 Next: Run master-cron to regenerate feeds and insight intelligence.");
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
