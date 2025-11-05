// /scripts/updateFeed.js
// 🔁 TinmanApps AppSumo Feed Builder v2
// Uses AppSumo's JSON API to fetch stable metadata (title + image + URL).

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const ROOT = path.resolve("./data");
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

// Category → listing page URL
const CATEGORIES = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  productivity: "https://appsumo.com/software/productivity/",
  ai: "https://appsumo.com/software/artificial-intelligence/",
  courses: "https://appsumo.com/courses-more/"
};

// Utility delay for politeness
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fetch any URL safely
async function safeFetch(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TinmanBot/2.0; +https://deals.tinmanapps.com)"
    },
    timeout: 10000
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

// Extract product slugs from listing HTML
function extractProductSlugs(html) {
  const regex = /href="\/products\/([a-zA-Z0-9-]+)\//g;
  const found = new Set();
  let match;
  while ((match = regex.exec(html))) found.add(match[1]);
  return Array.from(found);
}

// Query AppSumo API for each slug
async function getDealData(slug) {
  const apiUrl = `https://appsumo.com/api/v1/deals/${slug}/`;
  const res = await safeFetch(apiUrl);
  const json = await res.json();
  return {
    title: json.name || slug,
    url: `https://appsumo.com/products/${slug}/`,
    image: json.og_image || json.image || null,
    category: "unknown"
  };
}

// Process each category
async function processCategory(cat, url) {
  const deals = [];
  try {
    console.log(`⏳ Fetching ${cat} listing...`);
    const htmlRes = await safeFetch(url);
    const html = await htmlRes.text();
    const slugs = extractProductSlugs(html).slice(0, 10); // limit for safety
    console.log(`🔍 Found ${slugs.length} ${cat} slugs.`);

    for (const slug of slugs) {
      try {
        const deal = await getDealData(slug);
        deal.category = cat;
        deals.push(deal);
        console.log(`✅ ${cat}: ${deal.title}`);
        await sleep(250); // polite delay
      } catch (err) {
        console.log(`⚠️ ${cat} item ${slug} failed: ${err.message}`);
      }
    }

    const file = path.join(ROOT, `appsumo-${cat}.json`);
    fs.writeFileSync(file, JSON.stringify(deals, null, 2));
    console.log(`💾 Saved ${deals.length} → ${file}`);
    return deals.length;
  } catch (err) {
    console.log(`❌ ${cat} error: ${err.message}`);
    return 0;
  }
}

async function main() {
  let total = 0;
  for (const [cat, url] of Object.entries(CATEGORIES)) {
    total += await processCategory(cat, url);
  }
  console.log(`\n✅ Wrote ${total} total deals across ${Object.keys(CATEGORIES).length} categories.`);
}

main().catch(e => {
  console.error("Fatal updateFeed error:", e);
  process.exit(1);
});
