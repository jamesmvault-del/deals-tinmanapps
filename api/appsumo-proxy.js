// /api/appsumo-proxy.js
// Purpose: serve cached AppSumo data instantly and refresh in background.
// Works with diagnostic or full crawler versions of /api/appsumo-builder.js.
//
// ---------------------------------------------------------------------------
// API ROUTES
//   GET /api/appsumo-proxy                 → summary of cached categories
//   GET /api/appsumo-proxy?cat=software    → data for one category
//   GET /api/appsumo-proxy?refresh=1       → force background refresh (admin use)
// ---------------------------------------------------------------------------

import http from "http"; // safe to import anywhere
import { setTimeout as delay } from "timers/promises";

// In-memory cache
const CACHE = {
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

// Helper: standard JSON response
function okJson(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload, null, 2));
}

function bad(res, code, msg) {
  okJson(res, code, { error: msg });
}

// ---------------------------------------------------------------------------
// Simulated background refresh
// Later this will call your real /api/appsumo-builder endpoint or internal
// builder module to fetch live data.  For now it just generates realistic
// placeholder slugs to prove the refresh works asynchronously.
// ---------------------------------------------------------------------------

async function backgroundRefresh() {
  try {
    CACHE.meta.lastRefreshStatus = "running";
    const t0 = Date.now();

    // Simulate network delay & work
    await delay(1000);

    const newData = {};
    const makeSlug = (prefix, i) => `${prefix}-example-${i}`;

    for (const cat of Object.keys(CACHE.categories)) {
      newData[cat] = Array.from({ length: Math.floor(Math.random() * 5) + 5 }, (_, i) =>
        makeSlug(cat, i + 1)
      );
    }

    CACHE.categories = newData;
    CACHE.meta.totalDeals = Object.values(newData).reduce((a, arr) => a + arr.length, 0);
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.lastBuilderRun = CACHE.fetchedAt;
    CACHE.meta.lastRefreshStatus = `ok in ${Date.now() - t0}ms`;
  } catch (err) {
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return bad(res, 405, "Method not allowed. Use GET.");
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const cat = (url.searchParams.get("cat") || "").toLowerCase();
    const wantRefresh = url.searchParams.get("refresh") === "1";

    // Trigger background refresh manually
    if (wantRefresh) {
      backgroundRefresh(); // don't await; runs async
      return okJson(res, 200, { message: "Background refresh triggered." });
    }

    // Return one category
    if (cat) {
      const deals = CACHE.categories[cat];
      if (!deals) return bad(res, 404, `Unknown category: ${cat}`);
      return okJson(res, 200, {
        source: "TinmanApps Proxy",
        category: cat,
        fetchedAt: CACHE.fetchedAt,
        dealCount: deals.length,
        deals
      });
    }

    // Return summary
    const summary = Object.fromEntries(
      Object.entries(CACHE.categories).map(([k, v]) => [k, v.length])
    );

    return okJson(res, 200, {
      source: "TinmanApps Proxy",
      fetchedAt: CACHE.fetchedAt,
      totalDeals: CACHE.meta.totalDeals,
      byCategory: summary,
      notes: {
        lastBuilderRun: CACHE.meta.lastBuilderRun,
        lastRefreshStatus: CACHE.meta.lastRefreshStatus
      }
    });
  } catch (err) {
    bad(res, 500, `Proxy error: ${err.message}`);
  }
}
