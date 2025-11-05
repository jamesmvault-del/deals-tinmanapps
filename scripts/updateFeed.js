// /scripts/updateFeed.js
// 🔁 TinmanApps AppSumo Feed Builder v6 — HTML JSON extractor version
// Crawls AppSumo category pages via embedded __NEXT_DATA__ payloads

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const ROOT = path.resolve("./data");
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const CATEGORY_URLS = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  productivity: "https://appsumo.com/software/productivity/",
  ai: "https://appsumo.com/software/artificial-intelligence/",
  courses: "https://appsumo.com/courses-more/"
};

// helper
async function safeFetch(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TinmanBot/6.0; +https://deals.tinmanapps.com)"
    },
    timeout: 20000
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// extract embedded JSON
function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
  if (!match) throw new Error("No embedded JSON found.");
  return JSON.parse(match[1]);
}

function parseDeals(json, category) {
  const items =
    json?.props?.pageProps?.deals ||
    json?.props?.pageProps?.data?.deals ||
    [];
  return items.slice(0, 50).map((d) => ({
    title: d.title || "Untitled",
    url: `https://appsumo.com/products/${d.slug}/`,
    image: d.image?.url || d.image || null,
    category
  }));
}

async function main() {
  console.log("🚀 Starting TinmanApps AppSumo Feed Builder v6");
  const allCategories = Object.entries(CATEGORY_URLS);
  let total = 0;

  for (const [cat, url] of allCategories) {
    console.log(`⏳ Fetching ${cat} → ${url}`);
    try {
      const html = await safeFetch(url);
      const json = extractNextData(html);
      const deals = parseDeals(json, cat);
      const file = path.join(ROOT, `appsumo-${cat}.json`);
      fs.writeFileSync(file, JSON.stringify(deals, null, 2));
      console.log(`✅ Saved ${deals.length} → ${file}`);
      total += deals.length;
    } catch (err) {
      console.error(`❌ ${cat} error: ${err.message}`);
    }
  }

  console.log(`\n✅ Wrote ${total} total deals across ${allCategories.length} categories.`);
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
