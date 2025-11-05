// /lib/proxyCache.js
// Shared cache and refresh function for the proxy + cron system.

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

// Simple simulated refresh — replace later with real crawler logic.
export async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();
    await delay(1000);

    const newData = {};
    const makeSlug = (prefix, i) => `${prefix}-example-${i}`;
    for (const cat of Object.keys(CACHE.categories)) {
      newData[cat] = Array.from({ length: 5 }, (_, i) => makeSlug(cat, i + 1));
    }

    CACHE.categories = newData;
    CACHE.meta.totalDeals = Object.values(newData).flat().length;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0} ms`;
  } catch (err) {
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
  }
}
