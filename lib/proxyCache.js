// /lib/proxyCache.js
// 🔗 Authorised feed cache layer for TinmanApps Deal Engine
// Works with GitHub Action–maintained feed (data/appsumo-feed.json)

import { setTimeout as delay } from "timers/promises";

// ✅ Central cache store
export const CACHE = {
  fetchedAt: null,
  categories: {},
  meta: {
    totalDeals: 0,
    lastBuilderRun: null,
    lastRefreshStatus: null
  }
};

// ✅ The GitHub-hosted feed file (auto-updated every 6h via GitHub Action)
const FEED_URL = "https://raw.githubusercontent.com/jamesmvault-del/deals-tinmanapps/main/data/appsumo-feed.json";

// ✅ Your referral prefix (AppSumo Impact referral ID)
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// ✅ Safe fetch helper with timeout & error handling
async function fetchJson(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ✅ Category classification heuristics
function classify(deal) {
  const title = deal.title?.toLowerCase() || "";
  const url = deal.url?.toLowerCase() || "";

  if (url.includes("course") || title.includes("course") || title.includes("bootcamp")) return "courses";
  if (url.includes("ai") || title.includes("ai") || title.includes("chatgpt")) return "ai";
  if (url.includes("marketing") || title.includes("marketing") || title.includes("seo")) return "marketing";
  if (url.includes("productivity") || title.includes("workflow") || title.includes("time")) return "productivity";
  return "software";
}

// ✅ Background refresh — executed by master-cron or manual trigger
export async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();

    const allDeals = await fetchJson(FEED_URL);
    if (!Array.isArray(allDeals) || !allDeals.length) {
      CACHE.meta.lastRefreshStatus = "empty feed";
      return;
    }

    const categories = {
      software: [],
      marketing: [],
      productivity: [],
      ai: [],
      courses: [],
      new: []
    };

    let total = 0;

    for (const deal of allDeals) {
      const cat = classify(deal);
      const entry = {
        title: deal.title?.trim() || "Untitled",
        url: deal.url,
        referralUrl: REF_PREFIX + encodeURIComponent(deal.url),
        category: cat
      };
      categories[cat].push(entry);
      total++;
    }

    CACHE.categories = categories;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.totalDeals = total;
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0} ms (GitHub Action feed)`;

    console.log(`✅ Cache refreshed: ${total} deals across ${Object.keys(categories).length} categories`);
  } catch (err) {
    console.error("❌ backgroundRefresh error:", err);
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
  }
}

// ✅ Force a refresh manually from other endpoints
export async function manualRefresh() {
  await backgroundRefresh();
  return { status: "manual refresh complete", at: new Date().toISOString() };
}
