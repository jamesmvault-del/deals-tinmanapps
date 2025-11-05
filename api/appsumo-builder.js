// /api/appsumo-builder.js
// Simplified diagnostic build — fast version for connection testing
// Purpose: return valid JSON immediately (no crawling) so we can confirm
// the API and deployment behave correctly on the free Render plan.

const CATEGORIES = ["software", "marketing", "productivity", "ai", "courses"];

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
    const wantAll = url.searchParams.get("all") === "1";

    const now = new Date();
    const payload = {
      source: "AppSumo Builder (diagnostic)",
      builtAt: now.toISOString(),
      buildMs: Math.floor(Math.random() * 20),
      totalDeals: 0,
      byCategory: Object.fromEntries(CATEGORIES.map(c => [c, 0])),
      notes: {
        sitemapUrls: 0,
        scannedUrls: 0,
        dedupedSlugs: 0,
        diagnostic: "lightweight stub for connection test"
      }
    };

    if (cat) payload.focus = cat;
    if (!wantAll && !cat) {
      payload.hint = "Use ?all=1 or ?cat=software to test endpoint.";
    }

    okJson(res, 200, payload);
  } catch (err) {
    bad(res, 500, `Builder error: ${err.message}`);
  }
}
