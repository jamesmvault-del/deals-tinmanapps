// /scripts/updateFeed.js
// 🚀 TinmanApps AppSumo Feed Builder v10.1 — Auto-scroll + Compatibility Edition

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const ROOT = path.resolve("./data");
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const CATEGORY_URLS = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  productivity: "https://appsumo.com/software/productivity/",
  ai: "https://appsumo.com/software/artificial-intelligence/",
  courses: "https://appsumo.com/courses-more/"
};

// 🕒 universal delay helper
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

async function extractDeals(page, category) {
  try {
    await page.waitForSelector("a[href*='/products/']", { timeout: 30000 });
  } catch {
    console.warn(`⚠️ ${category}: no anchors initially, scrolling...`);
  }

  await autoScroll(page);
  await sleep(2000); // ⏳ allow lazy images/cards to render

  const deals = await page.$$eval("a[href*='/products/']", (anchors) => {
    const seen = new Set();
    return anchors
      .map((a) => {
        const url = a.getAttribute("href");
        const title = a.textContent.trim();
        const img = a.querySelector("img")?.src || null;
        if (!url || seen.has(url) || !url.includes("/products/")) return null;
        seen.add(url);
        return { title, url: `https://appsumo.com${url}`, image: img };
      })
      .filter(Boolean)
      .slice(0, 100);
  });

  return deals.map((d) => ({
    title: d.title || "Untitled",
    url: d.url,
    image: d.image || null,
    category
  }));
}

async function main() {
  console.log("🚀 Launching Puppeteer (auto-scroll mode)...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process"
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  let total = 0;

  for (const [cat, url] of Object.entries(CATEGORY_URLS)) {
    console.log(`\n⏳ Fetching ${cat} → ${url}`);
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      const deals = await extractDeals(page, cat);
      const file = path.join(ROOT, `appsumo-${cat}.json`);
      fs.writeFileSync(file, JSON.stringify(deals, null, 2));
      console.log(`✅ Saved ${deals.length} → ${file}`);
      total += deals.length;
    } catch (err) {
      console.error(`❌ ${cat} error: ${err.message}`);
    }
    await sleep(5000); // 🕐 throttle between pages
  }

  await browser.close();
  console.log(`\n✅ Wrote ${total} total deals across ${Object.keys(CATEGORY_URLS).length} categories.`);
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
