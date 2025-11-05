// scripts/updateFeed.js
// 🔁 Fetch latest AppSumo deals and update data/appsumo-feed.json

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const OUT_PATH = path.resolve("data/appsumo-feed.json");

const SOURCES = [
  { name: "software", url: "https://appsumo.com/api/v1/deals/?category=software" },
  { name: "courses", url: "https://appsumo.com/api/v1/deals/?category=courses-more" },
  { name: "new", url: "https://appsumo.com/api/v1/collections/new/" },
  { name: "ending", url: "https://appsumo.com/api/v1/collections/ending-soon/" }
];

async function fetchDeals() {
  const allDeals = [];

  for (const src of SOURCES) {
    console.log(`⏳ Fetching ${src.name} deals...`);
    try {
      const res = await fetch(src.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const items = (json.results || json.deals || []).map((d) => ({
        title: d.name || d.title,
        url: `https://appsumo.com${d.url || d.slug || ""}`,
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
