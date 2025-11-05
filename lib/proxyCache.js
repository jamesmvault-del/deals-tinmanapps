// /lib/proxyCache.js
// Shared in-memory cache + background crawler for real AppSumo data.
//
// Called by:
//   - /api/appsumo-proxy?refresh=1   → manual refresh
//   - /api/master-cron               → scheduled refresh
//
// The rest of your system (proxy endpoints) reads directly from CACHE.
// ---------------------------------------------------------------------

import { setTimeout as delay } from "timers/promises";

export const CACHE = {
  fetchedAt: null,
  categories: {
    software: [],
    marketing: [],
    productivity: [],
    ai: [],
    courses: []
  },
  meta: {
    totalDeals: 0,
    lastBuilderRun: null,
    lastRefreshStatus: null
  }
};

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

const SITEMAPS = [
  "https://appsumo.com/sitemap.xml",
  "https://appsumo.com/sitemap-products.xml",
  "https://appsumo.com/sitemap-deals.xml",
  "https://appsumo.com/sitemap-courses.xml"
];

const CATEGORIES = ["software", "marketing", "productivity", "ai", "courses"];

function classify(url, slug) {
  const lower = (url || "").toLowerCase();

  if (lower.includes("/course/") || lower.includes("/courses/")) return "courses";
  if (/(\bai\b|chatgpt|gpt|diffusion|prompt)/i.test(slug)) return "ai";
  if (/(seo|email|outreach|ads?|affiliate|funnel|lead|social|brand|pr|press)/i.test(slug))
    return "marketing";
  if (/(task|project|kanban|calendar|note|docs?|wiki|workflow|focus|pdf)/i.test(slug))
    return "productivity";
  return "software";
}

function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = (parts[parts.length - 1] || "").toLowerCase().replace(/[^a-z0-9\-]/g, "-");
    return slug || null;
  } catch {
    return null;
  }
}

function extractLocs(xml) {
  if (!xml) return [];
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const url = m[1].trim();
    if (url) locs.push(url);
  }
  return locs;
}

async function safeFetchText(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------
// Background refresh — real crawler
// ---------------------------------------------------------------------

export async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();

    const discovered = new Set();
    for (const s of SITEMAPS) {
      try {
        const xml = await safeFetchText(s);
        const locs = extractLocs(xml);
        for (const loc of locs) {
          if (/^https?:\/\/(www\.)?appsumo\.com\/.*$/i.test(loc)) discovered.add(loc);
        }
      } catch {
        // ignore sitemap fetch errors
      }
    }

    // Filter to likely product/deal/course pages
    const urls = Array.from(discovered).filter((u) => {
      const p = u.toLowerCase();
      return (
        p.includes("/product/") ||
        p.includes("/products/") ||
        p.includes("/deal/") ||
        p.includes("/deals/") ||
        p.includes("/course/") ||
        p.includes("/courses/")
      );
    });

    // Classify & fill cache
    const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, new Set()]));
    const slugsSeen = new Set();

    for (const url of urls) {
      const slug = slugFromUrl(url);
      if (!slug || slugsSeen.has(slug)) continue;
      slugsSeen.add(slug);
      const category = classify(url, slug);
      byCat[category].add(slug);
    }

    // Commit results
    CACHE.categories = Object.fromEntries(
      CATEGORIES.map((c) => [c, Array.from(byCat[c]).slice(0, 500)])
    );
    CACHE.meta.totalDeals = slugsSeen.size;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0} ms (real data)`;
  } catch (err) {
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
  }
}
