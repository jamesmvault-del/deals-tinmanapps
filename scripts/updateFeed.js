// scripts/updateFeed.js
// 🔁 Per-category AppSumo feed fetcher for TinmanApps Deal Engine
// Generates one JSON file per category (software, marketing, productivity, ai, courses)

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const CATEGORIES = {
  software: "https://appsumo.com/api/v2/deals/?category=software",
  marketing: "https://appsumo.com/api/v2/deals/?category=marketing-sales",
  productivity: "https://appsumo.com/api/v2/deals/?category=productivity",
  ai: "https://appsumo.com/api/v2/deals/?category=ai-tools",
  courses: "https://appsumo.com/api/v2/deals/?category=courses-more"
};

async function fetchCategory(cat, url) {
  console.log(`⏳ Fetching ${cat}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  const deals = (json.results || json.deals || json.data || []).map((d) => ({
    title: d.name || d.title || d.slug || "Untitled",
    url: d.url
      ? `https://appsumo.com${d.url}`
      : d.slug
      ? `https://appsumo.com/products/${d.slug}/`
      : "https://appsumo.com/",
    category: cat
  }));

  const file = path.resolve(`data/appsumo-${cat}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(deals, null, 2));
  console.log(`✅ Saved ${deals.length} → ${file}`);
  return deals.length;
}

async function main() {
  let total = 0;
  for (const [cat, url] of Object.entries(CATEGORIES)) {
    try {
      total += await fetchCategory(cat, url);
    } catch (err) {
      console.error(`❌ ${cat} failed:`, err.message);
    }
  }
  console.log(`\n✅ Wrote ${total} total deals across ${Object.keys(CATEGORIES).length} categories.`);
}

await main();
