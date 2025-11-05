// /lib/proxyCache.js
// 🔗 Authorised feed cache layer for TinmanApps Deal Engine
// Reads per-category JSON feeds from GitHub (software, marketing, productivity, ai, courses)

import { setTimeout as delay } from "timers/promises";

export const CACHE = {
  fetchedAt: null,
  categories: {},
  meta: {
    totalDeals: 0,
    lastBuilderRun: null,
    lastRefreshStatus: null
  }
};

// ✅ GitHub-hosted feed URLs (update <your-user> if needed)
const BASE = "https://raw.githubusercontent.com/jamesmvault-del/deals-tinmanapps/main/data";
const FEEDS = [
  { name: "software", url: `${BASE}/appsumo-software.json` },
  { name: "marketing", url: `${BASE}/appsumo-marketing.json` },
  { name: "productivity", url: `${BASE}/appsumo-productivity.json` },
  { name: "ai", url: `${BASE}/appsumo-ai.json` },
  { name: "courses", url: `${BASE}/appsumo-courses.json` }
];

// ✅ Referral prefix
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// ✅ Safe JSON fetcher
async function fetchJson(url, timeout = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ✅ Background refresh (called by master-cron)
export async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();
    const cats = {};
    let total = 0;

    for (const feed of FEEDS) {
      try {
        const data = await fetchJson(feed.url);
        const mapped = data.map((d) => ({
          title: d.title?.trim() || "Untitled",
          url: d.url,
          referralUrl: REF_PREFIX + encodeURIComponent(d.url),
          category: feed.name
        }));
        cats[feed.name] = mapped;
        total += mapped.length;
        console.log(`✅ Loaded ${mapped.length} from ${feed.name}`);
      } catch (err) {
        console.error(`❌ ${feed.name} error:`, err.message);
        cats[feed.name] = [];
      }
    }

    CACHE.categories = cats;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.totalDeals = total;
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0} ms (per-category feeds)`;

    console.log(`✅ Cache refreshed: ${total} deals total`);
  } catch (err) {
    console.error("❌ backgroundRefresh error:", err);
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
  }
}

// ✅ Manual trigger
export async function manualRefresh() {
  await backgroundRefresh();
  return { status: "manual refresh complete", at: new Date().toISOString() };
}
