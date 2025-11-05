// lib/proxyCache.js
// Shared in-memory cache + refresh function for proxy and cron

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

// backgroundRefresh() can later call the real builder;
// for now it just fills mock slugs quickly.
export async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();
    await delay(1000);

    const newData = {};
    const makeSlug = (p, i) => `${p}-example-${i}`;
    for (const cat of Object.keys(CACHE.categories)) {
      newData[cat] = Array.from({ length: 5 }, (_, i) => makeSlug(cat, i + 1));
    }

    CACHE.categories = newData;
    CACHE.meta.totalDeals = Object.values(newData).flat().length;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0} ms`;
  } catch (e) {
    CACHE.meta.lastRefreshStatus = `error: ${e.message}`;
  }
}
