// /lib/proxyCache.js
// Enhanced classifier for realistic category mapping (AppSumo live data)

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
// CONFIG
// ---------------------------------------------------------------------

const SITEMAPS = [
  "https://appsumo.com/sitemap.xml",
  "https://appsumo.com/sitemap-products.xml",
  "https://appsumo.com/sitemap-deals.xml",
  "https://appsumo.com/sitemap-courses.xml"
];

const CATEGORIES = ["software", "marketing", "productivity", "ai", "courses"];

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] || "").toLowerCase().replace(/[^a-z0-9\-]/g, "-");
  } catch {
    return null;
  }
}

function extractLocs(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

async function safeFetchText(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------
// SMART CLASSIFIER (keyword-based, fast)
// ---------------------------------------------------------------------

function classify(url, slug) {
  const text = `${url} ${slug}`.toLowerCase();

  if (/(course|learn|training|masterclass|academy|tutorial|lesson|bootcamp|education|class)/i.test(text))
    return "courses";

  if (/(ai|gpt|prompt|diffusion|copilot|openai|chatgpt|generator|vision|model)/i.test(text))
    return "ai";

  if (/(seo|email|outreach|ads?|affiliate|funnel|lead|social|brand|press|pr|content|campaign)/i.test(text))
    return "marketing";

  if (/(task|project|kanban|calendar|note|docs?|wiki|workflow|focus|pdf|time|team|productivity)/i.test(text))
    return "productivity";

  return "software";
}

// ---------------------------------------------------------------------
// BACKGROUND REFRESH (real AppSumo crawl, free-tier tuned)
// ---------------------------------------------------------------------

export async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();

    const discovered = new Set();
    for (const s of SITEMAPS) {
      try {
        const xml = await safeFetchText(s);
        extractLocs(xml).forEach((u) => {
          if (/^https?:\/\/(www\.)?appsumo\.com\//i.test(u)) discovered.add(u);
        });
      } catch {}
    }

    const urls = Array.from(discovered).filter((u) =>
      /(product|deal|course|learn|training|masterclass)/i.test(u)
    );

    const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, new Set()]));
    const seen = new Set();

    for (const url of urls) {
      const slug = slugFromUrl(url);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      byCat[classify(url, slug)].add(slug);
    }

    CACHE.categories = Object.fromEntries(
      CATEGORIES.map((c) => [c, Array.from(byCat[c]).slice(0, 1000)])
    );

    CACHE.meta.totalDeals = seen.size;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0} ms (enhanced classifier)`;
  } catch (err) {
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
  }
}
