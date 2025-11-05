// /api/appsumo-proxy.js
// Purpose: serve cached AppSumo data instantly, refresh in background.

import { CACHE, backgroundRefresh } from "../lib/proxyCache.js";

function okJson(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload, null, 2));
}

function bad(res, code, msg) {
  okJson(res, code, { error: msg });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return bad(res, 405, "Method not allowed. Use GET.");
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const cat = (url.searchParams.get("cat") || "").toLowerCase();
    const wantRefresh = url.searchParams.get("refresh") === "1";

    // Background refresh trigger
    if (wantRefresh) {
      backgroundRefresh(); // async
      return okJson(res, 200, { message: "Background refresh triggered." });
    }

    // Category-specific view
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

    // Summary
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
