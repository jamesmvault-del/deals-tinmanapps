// /scripts/updateFeed.js
// 🔁 TinmanApps AppSumo Feed Builder v5
// Handles both sitemap index + fallback to numbered product sitemaps

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const ROOT = path.resolve("./data");
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const SITEMAP_INDEX = "https://appsumo.com/sitemap.xml";

// Fallback range if index fails
const FALLBACK_SITEMAPS = Array.from({ length: 10 }, (_, i) => 
  `https://appsumo.com/sitemap-products-${i + 1}.xml`
);

const CATEGORY_KEYWORDS = {
  software: ["software", "tool", "platform", "saas", "automation"],
  marketing: ["marketing", "email", "social", "seo", "sales"],
  productivity: ["productivity", "workflow", "time", "task", "calendar"],
  ai: ["ai", "chatgpt", "gpt", "machine", "assistant"],
  courses: ["course", "training", "bootcamp", "learn"]
};

async function safeFetch(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TinmanBot/5.0; +https://deals.tinmanapps.com)"
    },
    timeout: 20000
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function classify(title, loc) {
  const text = `${title} ${loc}`.toLowerCase();
  for (const [cat, keys] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keys.some(k => text.includes(k))) return cat;
  }
  return "software";
}

async function getProductSitemaps() {
  try {
    const xml = await safeFetch(SITEMAP_INDEX);
    if (xml.startsWith("<!DOCTYPE html") || xml.includes("<html")) {
      console.warn("⚠️ Sitemap index returned HTML, using fallback list.");
      return FALLBACK_SITEMAPS;
    }
    const data = await parseStringPromise(xml, { explicitArray: false });
    const entries = data.sitemapindex?.sitemap || [];
    const urls = (Array.isArray(entries) ? entries : [entries])
      .map(x => x.loc)
      .filter(u => u.includes("sitemap-products-"));
    if (urls.length === 0) {
      console.warn("⚠️ No product sitemaps found, using fallback list.");
      return FALLBACK_SITEMAPS;
    }
    console.log(`📖 Found ${urls.length} product sitemaps.`);
    return urls;
  } catch (err) {
    console.warn(`⚠️ Sitemap index failed (${err.message}), using fallback list.`);
    return FALLBACK_SITEMAPS;
  }
}

async function parseProductSitemap(url) {
  const xml = await safeFetch(url);
  const data = await parseStringPromise(xml, { explicitArray: false });
  const urls = data.urlset?.url || [];
  return Array.isArray(urls) ? urls : [urls];
}

async function main() {
  console.log("⏳ Fetching sitemap index...");
  const productSitemaps = await getProductSitemaps();

  const perCategory = {
    software: [],
    marketing: [],
    productivity: [],
    ai: [],
    courses: []
  };
  let total = 0;

  for (const sm of productSitemaps) {
    console.log(`📦 Parsing ${sm}`);
    try {
      const items = await parseProductSitemap(sm);
      for (const u of items) {
        const loc = u.loc;
        const img = u["image:image"]?.["image:loc"] || null;
        const title =
          u["image:image"]?.["image:title"] ||
          loc.split("/").slice(-2, -1)[0];
        const cat = classify(title, loc);

        const deal = {
          title: title?.trim() || "Untitled",
          url: loc,
          image: img,
          category: cat
        };
        if (perCategory[cat].length < 50) {
          perCategory[cat].push(deal);
          total++;
        }
      }
    } catch (err) {
      console.log(`⚠️ ${sm} failed: ${err.message}`);
    }
  }

  for (const [cat, arr] of Object.entries(perCategory)) {
    const file = path.join(ROOT, `appsumo-${cat}.json`);
    fs.writeFileSync(file, JSON.stringify(arr, null, 2));
    console.log(`💾 Saved ${arr.length} → ${file}`);
  }

  console.log(`\n✅ Wrote ${total} total deals across ${Object.keys(perCategory).length} categories.`);
}

main().catch(e => {
  console.error("Fatal updateFeed error:", e);
  process.exit(1);
});
