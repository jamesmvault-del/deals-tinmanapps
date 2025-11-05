// /api/appsumo-builder.js
// World-class, self-learning SEO system — AppSumo builder (Node, not Edge)
// Purpose: Crawl AppSumo sitemap(s), dedupe slugs, classify, cache in memory,
// and expose build metrics (counts + durations). Never expose raw partner URLs.
//
// Compatible with: simple Node router or serverless environment.
// Use later with Render once repository structure is complete.

const SITEMAPS = [
  "https://appsumo.com/sitemap.xml",
  "https://appsumo.com/sitemap-products.xml",
  "https://appsumo.com/sitemap-deals.xml",
  "https://appsumo.com/sitemap-courses.xml"
];

const CATEGORIES = ["software", "marketing", "productivity", "ai", "courses"];

const CACHE = {
  builtAt: null,
  byCategory: {
    software: new Set(),
    marketing: new Set(),
    productivity: new Set(),
    ai: new Set(),
    courses: new Set()
  },
  meta: { slugsSeen: new Set(), urlCount: 0, sitemapCount: 0 }
};

function okJson(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload, null, 2));
}

function bad(res, code, msg) {
  okJson(res, code, { error: msg });
}

function toISO(d = new Date()) {
  return new Date(d).toISOString();
}

function withTimeout(promise, ms, label = "fetch") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return Promise.race([
    promise(ctrl.signal),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms + 10)
    )
  ]).finally(() => clearTimeout(t));
}

async function safeFetchText(url, ms = 8000) {
  return withTimeout(async (signal) => {
    const r = await fetch(url, { signal, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }, ms, `fetch ${url}`);
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

function resetCache() {
  CACHE.builtAt = null;
  for (const c of CATEGORIES) CACHE.byCategory[c] = new Set();
  CACHE.meta = { slugsSeen: new Set(), urlCount: 0, sitemapCount: 0 };
}

async function discoverSitemaps() {
  const discovered = new Set();
  for (const s of SITEMAPS) {
    try {
      const xml = await safeFetchText(s);
      discovered.add(s);
      const locs = extractLocs(xml);
      for (const loc of locs) {
        if (/^https?:\/\/(www\.)?appsumo\.com\/.*$/i.test(loc)) {
          discovered.add(loc);
        }
      }
    } catch {}
  }
  return Array.from(discovered);
}

function filterLikelyProductUrls(urls) {
  return urls.filter((u) => {
    if (!/^https?:\/\//i.test(u)) return false;
    if (/\.(xml|x?html)($|\?)/i.test(u)) return false;
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
}

async function buildAll({ limit = 50 } = {}) {
  const t0 = Date.now();
  const sitemapList = await discoverSitemaps();
  let productUrlCandidates = [];
  for (const sm of sitemapList) {
    try {
      const xml = await safeFetchText(sm);
      const locs = extractLocs(xml);
      productUrlCandidates.push(...locs);
    } catch {}
  }
  productUrlCandidates.push(...sitemapList);
  const productUrls = filterLikelyProductUrls(Array.from(new Set(productUrlCandidates)).slice(0, limit));

  resetCache();
  CACHE.meta.urlCount = productUrls.length;
  CACHE.meta.sitemapCount = sitemapList.length;

  for (const url of productUrls) {
    const slug = slugFromUrl(url);
    if (!slug) continue;
    if (CACHE.meta.slugsSeen.has(slug)) continue;
    const category = classify(url, slug);
    CACHE.byCategory[category].add(slug);
    CACHE.meta.slugsSeen.add(slug);
  }

  CACHE.builtAt = toISO();
  const buildMs = Date.now() - t0;
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, CACHE.byCategory[c].size]));
  const totalDeals = CACHE.meta.slugsSeen.size;

  return {
    source: "AppSumo Builder",
    builtAt: CACHE.builtAt,
    buildMs,
    totalDeals,
    byCategory: counts,
    notes: {
      sitemapUrls: CACHE.meta.sitemapCount,
      scannedUrls: CACHE.meta.urlCount,
      dedupedSlugs: totalDeals
    }
  };
}

async function buildOne(category) {
  const metrics = await buildAll();
  const sample = Array.from(CACHE.byCategory[category]).slice(0, 20);
  return { ...metrics, focus: category, sample };
}

export default async function handler(req, res) {
  try {
    const fullUrl = new URL(req.url, `http://${req.headers.host}`);
    const params = fullUrl.searchParams;
    const wantAll = params.get("all") === "1";
    const cat = (params.get("cat") || "").toLowerCase();
    const debug = params.get("debug") === "1";

    if (req.method !== "GET")
      return bad(res, 405, "Method not allowed. Use GET.");

    if (!wantAll && !cat)
      return okJson(res, 200, {
        source: "AppSumo Builder",
        hint: "Use ?all=1 or ?cat=software|marketing|productivity|ai|courses",
        categories: CATEGORIES
      });

    if (cat && !CATEGORIES.includes(cat))
      return bad(res, 400, `Unknown category: ${cat}`);

    const metrics = cat ? await buildOne(cat) : await buildAll();
    if (debug)
      metrics.sample = Object.fromEntries(
        CATEGORIES.map((c) => [c, Array.from(CACHE.byCategory[c]).slice(0, 10)])
      );

    okJson(res, 200, metrics);
  } catch (err) {
    bad(res, 500, `Builder error: ${err.message}`);
  }
}
