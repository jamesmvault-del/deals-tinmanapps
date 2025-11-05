// scripts/updateFeed.js
// Update AppSumo feed snapshot inside repo

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const FEED_URLS = [
  "https://appsumo.com/api/v1/deals/?category=software",
  "https://appsumo.com/api/v1/deals/?category=courses-more",
  "https://appsumo.com/api/v1/collections/new/"
];

const outPath = path.resolve("data/appsumo-feed.json");

async function fetchDeals() {
  const allDeals = [];

  for (const url of FEED_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = (json.results || json.deals || []).map((d) => ({
        title: d.name || d.title,
        url: `https://appsumo.com${d.url || d.slug || ""}`,
        category: d.category || "software"
      }));
      allDeals.push(...items);
    } catch (err) {
      console.error("Feed error", url, err.message);
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(allDeals, null, 2));
  console.log(`✅ Saved ${allDeals.length} deals → ${outPath}`);
}

fetchDeals();
