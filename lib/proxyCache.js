// /lib/proxyCache.js
// ----------------------------------------------------------
// World-class self-refreshing cache layer (authorised version)
// ----------------------------------------------------------

import { setTimeout as delay } from "timers/promises";

export const CACHE = {
  fetchedAt: null,
  categories: {},
  meta: { totalDeals: 0, lastBuilderRun: null, lastRefreshStatus: null }
};

// === CONFIG ==================================================
const FEEDS = [
  { name: "software", url: "https://data.tinmanapps.com/appsumo-software.json" },
  { name: "courses", url: "https://data.tinmanapps.com/appsumo-courses.json" },
  { name: "new", url: "https://data.tinmanapps.com/appsumo-new.json" }
];

// Your Impact referral prefix
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// === HELPERS =================================================
async function fetchJson(url, timeout = 8000) {
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

// === BACKGROUND REFRESH ======================================
export async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();

    const newCats = {};
    let total = 0;

    for (const feed of FEEDS) {
      try {
        const data = await fetchJson(feed.url);
        const mapped = data.map((d) => ({
          ...d,
          referralUrl: REF_PREFIX + encodeURIComponent(d.url)
        }));
        newCats[feed.name] = mapped;
        total += mapped.length;
      } catch (e) {
        newCats[feed.name] = [];
        console.error(`Feed error (${feed.name}):`, e.message);
      }
    }

    CACHE.categories = newCats;
    CACHE.meta.totalDeals = total;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0} ms (authorised feed)`;
  } catch (err) {
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
  }
}
