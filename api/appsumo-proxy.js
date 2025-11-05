// /api/appsumo-proxy.js
// 🌍 TinmanApps Adaptive AppSumo Proxy
// Merges category feeds → adds referral + image + SEO metadata

import fs from "fs";
import path from "path";
import url from "url";

// ✅ Define file paths relative to project root
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../data");

// ✅ Referral prefix (AppSumo affiliate ID)
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// ✅ Safe JSON loader
function loadJson(file) {
  try {
    const fullPath = path.join(dataDir, file);
    if (fs.existsSync(fullPath)) {
      const raw = fs.readFileSync(fullPath, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`❌ Failed to load ${file}:`, err);
  }
  return [];
}

// ✅ Basic SEO / CTR enhancement
function enrichDeal(deal, category) {
  const baseUrl = deal.url || "";
  const slug = baseUrl.split("/products/")[1]?.replace("/", "") || "unknown";

  return {
    title: deal.title?.trim() || slug,
    slug,
    category,
    url: baseUrl,
    referralUrl: REF_PREFIX + encodeURIComponent(baseUrl),
    image:
      deal.image ||
      `https://deals.tinmanapps.com/assets/placeholder.webp`,
    seo: {
      clickbait: `Discover ${deal.title} — #1 in ${category}`,
      keywords: [
        category,
        "AppSumo",
        "lifetime deal",
        deal.title?.toLowerCase(),
        "exclusive offer"
      ],
      cta: [
        "Unlock this deal →",
        "Save big today →",
        "Get instant lifetime access →",
        "Upgrade your workflow →"
      ][Math.floor(Math.random() * 4)]
    }
  };
}

// ✅ API endpoint
export default async function appsumoProxy(req, res) {
  try {
    const { cat, refresh } = req.query;
    const start = Date.now();

    // Category files to merge
    const categories = [
      "software",
      "marketing",
      "productivity",
      "ai",
      "courses"
    ];

    // Load all feeds
    const data = {};
    let total = 0;

    for (const c of categories) {
      const deals = loadJson(`appsumo-${c}.json`).map((d) => enrichDeal(d, c));
      data[c] = deals;
      total += deals.length;
    }

    const response = {
      source: "TinmanApps Proxy",
      fetchedAt: new Date().toISOString(),
      totalDeals: total,
      byCategory: Object.fromEntries(
        categories.map((c) => [c, data[c]?.length || 0])
      ),
      categories: data,
      notes: {
        lastBuilderRun: new Date().toISOString(),
        lastRefreshStatus: `ok in ${Date.now() - start} ms (merged ${
          total
        } deals)`
      }
    };

    // Filter if ?cat= specified
    if (cat && data[cat]) {
      res.json({
        source: "TinmanApps Proxy",
        category: cat,
        fetchedAt: response.fetchedAt,
        dealCount: data[cat].length,
        deals: data[cat]
      });
    } else {
      res.json(response);
    }
  } catch (err) {
    console.error("❌ appsumoProxy error:", err);
    res.status(500).json({ error: "Proxy failure", details: err.message });
  }
}
