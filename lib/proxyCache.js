// lib/proxyCache.js
// 🔗 Authorised feed cache layer for TinmanApps Deal Engine
// Reads GitHub Action feed and classifies by category

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

// ✅ GitHub-hosted feed (replace <your-user> if needed)
const FEED_URL = "https://raw.githubusercontent.com/jamesmvault-del/deals-tinmanapps/main/data/appsumo-feed.json";

// ✅ Your referral prefix
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// ✅ Fetch helper with timeout
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

// ✅ Category logic
function classify(deal) {
  const t = deal.title?.toLowerCase() || "";
  const u = deal.url?.toLowerCase() || "";

  if (u.includes("course") || t.includes("course") || t.includes("bootcamp")) return "courses";
  if (u.includes("ai") || t.includes("ai") || t.includes("chatgpt")) return "ai";
  if (u.includes("marketing") || t.includes("marketing") || t.includes("seo")) return "marketing";
  if (u.includes("productivity") || t.includes("workflow") || t.includes("time")) return "productivity";
  if (u.includes("new") || t.includes("new")) return "new";
  return "software";
}

// ✅ Refresh logic
export async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();

    const allDeals = await fetchJson(FEED_URL);
    if (!Array.isArray(allDeals) || !allDeals.length) {
      CACHE.meta.lastRefreshStatus = "empty feed";
      return;
    }

    const cats = { software: [], marketing: [], productivity: [], ai: [], courses: [], new: [] };
    let total = 0;

    for (const d of allDeals) {
      const cat = classify(d);
      const entry = {
        title: d.title?.trim() || "Untitled",
        url: d.url,
        referralUrl: REF_PREFIX + encodeURIComponent(d.url),
        category: cat
      };
      cats[cat].push(entry);
      total++;
    }

    CACHE.categories = cats;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.totalDeals = total;
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0} ms (GitHub Action feed)`;

    console.log(`✅ Cache refreshed: ${total} deals`);
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
