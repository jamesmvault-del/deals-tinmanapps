// /scripts/updateFeed.js
// 🔁 TinmanApps AppSumo Feed Builder v3 (sitemap-driven)
// Parses https://appsumo.com/sitemap-products.xml for title, slug, image, and category.

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const ROOT = path.resolve("./data");
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const SITEMAP_URL = "https://appsumo.com/sitemap-products.xml";

// Heuristic keyword sets for category classification
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
        "Mozilla/5.0 (compatible; TinmanBot/3.0; +https://deals.tinmanapps.com)"
    },
    timeout: 15000
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

async function processSitemap() {
  console.log(`⏳ Fetching sitemap...`);
  const xml = await safeFetch(SITEMAP_URL);
  const data = await parseStringPromise(xml, { explicitArray: false });

  const urls = data.urlset.url || [];
  const items = Array.isArray(urls) ? urls : [urls];
  console.log(`📦 Found ${items.length} URLs in sitemap.`);

  const perCategory = {
    software: [],
    marketing: [],
    productivity: [],
    ai: [],
    courses: []
  };

  let total = 0;

  for (const u of items) {
    const loc = u.loc;
    const img = u["image:image"]?.["image:loc"] || null;
    const title = u["image:image"]?.["image:title"] || loc.split("/").slice(-2, -1)[0];
    const cat = classify(title, loc);

    const deal = {
      title: title?.trim() || "Untitled",
      url: loc,
      image: img,
      category: cat
    };
    perCategory[cat].push(deal);
    total++;
  }

  // Write per-category files
  for (const [cat, arr] of Object.entries(perCategory)) {
    const file = path.join(ROOT, `appsumo-${cat}.json`);
    fs.writeFileSync(file, JSON.stringify(arr.slice(0, 50), null, 2));
    console.log(`💾 Saved ${arr.length} → ${file}`);
  }

  console.log(`\n✅ Wrote ${total} total deals across ${Object.keys(perCategory).length} categories.`);
}

processSitemap().catch(err => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
