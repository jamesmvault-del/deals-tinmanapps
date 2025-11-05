// /scripts/updateFeed.js
// 🚀 TinmanApps AppSumo Feed Builder v9 — DOM Extraction Mode
// Works on live AppSumo pages via Puppeteer, no Next.js dependency

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

async function extractDeals(page, category) {
  // Wait for deal cards to render dynamically
  await page.waitForSelector("a[href*='/products/']", { timeout: 30000 });

  const deals = await page.$$eval("a[href*='/products/']", (anchors) => {
    const seen = new Set();
    return anchors
      .map((a) => {
        const url = a.getAttribute("href");
        const title = a.textContent.trim();
        const img = a.querySelector("img")?.src || null;
        if (!url || seen.has(url)) return null;
        seen.add(url);
        return { title, url: `https://appsumo.com${url}`, image: img };
      })
      .filter(Boolean)
      .slice(0, 50);
  });

  return deals.map((d) => ({
    title: d.title || "Untitled",
    url: d.url,
    image: d.image || null,
    category
  }));
}

async function main() {
  console.log("🚀 Launching Puppeteer (DOM mode)...");
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
  let total = 0;

  for (const [cat, url] of Object.entries(CATEGORY_URLS)) {
    console.log(`⏳ Fetching ${cat} → ${url}`);
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
  }

  await browser.close();
  console.log(
    `\n✅ Wrote ${total} total deals across ${Object.keys(CATEGORY_URLS).length} categories.`
  );
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
