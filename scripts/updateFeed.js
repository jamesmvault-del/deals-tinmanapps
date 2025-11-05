// /scripts/updateFeed.js
// 🔁 TinmanApps AppSumo Feed Builder with OG:image scraping
// Gathers per-category deal lists and extracts stable thumbnails.

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const ROOT = path.resolve("./data");
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const CATEGORIES = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  productivity: "https://appsumo.com/software/productivity/",
  ai: "https://appsumo.com/software/artificial-intelligence/",
  courses: "https://appsumo.com/courses-more/"
};

// simple util
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// fetch page html safely
async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TinmanBot/1.0; +https://deals.tinmanapps.com)"
    },
    timeout: 10000
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

// extract product urls from listing page
function extractProductLinks(html) {
  const regex = /href="(\/products\/[a-zA-Z0-9-]+\/)"/g;
  const found = new Set();
  let match;
  while ((match = regex.exec(html))) found.add("https://appsumo.com" + match[1]);
  return Array.from(found);
}

// extract og:image and title from product page
function extractMeta(html) {
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  return {
    title: titleMatch ? titleMatch[1] : "Untitled",
    image: imageMatch ? imageMatch[1] : null
  };
}

async function processCategory(cat, url) {
  const deals = [];
  try {
    console.log(`⏳ Fetching ${cat}...`);
    const html = await fetchHTML(url);
    const links = extractProductLinks(html).slice(0, 10); // sample limit for safety

    for (const link of links) {
      try {
        const productHTML = await fetchHTML(link);
        const meta = extractMeta(productHTML);
        deals.push({
          title: meta.title,
          url: link,
          image: meta.image
        });
        await sleep(250); // polite delay
      } catch (err) {
        console.log(`⚠️  ${cat} item error: ${err.message}`);
      }
    }

    const file = path.join(ROOT, `appsumo-${cat}.json`);
    fs.writeFileSync(file, JSON.stringify(deals, null, 2));
    console.log(`✅ Saved ${deals.length} → ${file}`);
    return deals.length;
  } catch (err) {
    console.log(`❌ ${cat} error: ${err.message}`);
    return 0;
  }
}

async function main() {
  let total = 0;
  for (const [cat, url] of Object.entries(CATEGORIES)) {
    const count = await processCategory(cat, url);
    total += count;
  }
  console.log(`\n✅ Wrote ${total} total deals across ${Object.keys(CATEGORIES).length} categories.`);
}

main().catch(e => {
  console.error("Fatal updateFeed error:", e);
  process.exit(1);
});
