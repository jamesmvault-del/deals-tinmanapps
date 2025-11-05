// scripts/updateFeed.js
// 🔁 Fetch latest AppSumo deals and update data/appsumo-feed.json
// Works with the current (2025) AppSumo public JSON endpoints

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const OUT_PATH = path.resolve("data/appsumo-feed.json");

// Current working AppSumo JSON feeds (mirroring their live site)
const SOURCES = [
  { name: "software", url: "https://appsumo.com/api/v2/deals/?category=software" },
  { name: "marketing", url: "https://appsumo.com/api/v2/deals/?category=marketing-sales" },
  { name: "ai", url: "https://appsumo.com/api/v2/deals/?category=ai-tools" },
  { name: "productivity", url: "https://appsumo.com/api/v2/deals/?category=productivity" },
  { name: "courses", url: "https://appsumo.com/api/v2/deals/?category=courses-more" },
  { name: "new", url: "https://appsumo.com/api/v2/collections/new/" },
  { name: "ending-soon", url: "https://appsumo.com/api/v2/collections/ending-soon/" }
];

async function fetchDeals() {
  const allDeals = [];

  for (const src of SOURCES) {
    console.log(`⏳ Fetching ${src.name} deals...`);
    try {
      const res = await fetch(src.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // Normalise possible structures (v2 returns deals under .results or .data)
      const items = (json.results || json.deals || json.data || []).map((d) => ({
        title: d.name || d.title || d.slug || "Untitled",
        url: d.url
          ? `https://appsumo.com${d.url}`
          : d.slug
          ? `https://appsumo.com/products/${d.slug}/`
          : "https://appsumo.com/",
        category: src.name
      }));

      console.log(`✅ ${src.name}: ${items.length} deals`);
      allDeals.push(...items);
    } catch (err) {
      console.error(`❌ ${src.name} feed failed:`, err.message);
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(allDeals, null, 2));
  console.log(`\n✅ Wrote ${allDeals.length} deals → ${OUT_PATH}`);
}

await fetchDeals();
