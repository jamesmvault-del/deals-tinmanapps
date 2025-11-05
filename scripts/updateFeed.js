// /scripts/updateFeed.js
// 🧠 TinmanApps AppSumo Feed Builder v7 — Clean & Normalized Version
// Removes duplicates, #reviews anchors, and invalid links

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

// ✅ Target categories and URLs
const BASE_CATEGORIES = {
  software: "https://appsumo.com/software/",
  marketing: "https://appsumo.com/software/marketing-sales/",
  productivity: "https://appsumo.com/software/productivity/",
  ai: "https://appsumo.com/software/artificial-intelligence/",
  courses: "https://appsumo.com/courses-more/",
};

// ✅ Output directory
const DATA_DIR = path.join(process.cwd(), "data");

// ✅ Helper — save JSON safely
function saveJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, file),
    JSON.stringify(data, null, 2),
    "utf8"
  );
  console.log(`💾 Saved ${data.length} → ${path.join("data", file)}`);
}

// ✅ Auto-scroll (simulate user scroll)
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  });
}

// ✅ Core logic
async function main() {
  console.log("🚀 Launching Puppeteer (clean mode)...");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();

  const results = {};

  for (const [cat, url] of Object.entries(BASE_CATEGORIES)) {
    console.log(`⏳ Fetching ${cat} → ${url}`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Smooth scroll for lazy content
      await autoScroll(page);

      const links = await page.$$eval("a[href*='/products/']", (anchors) =>
        anchors.map((a) => a.href)
      );

      const clean = [
        ...new Set(
          links
            // ✅ Only valid product URLs
            .filter(
              (href) =>
                href.includes("appsumo.com/products/") &&
                !href.includes("#reviews") &&
                !href.includes("?utm") &&
                !href.includes("blog.") &&
                !href.match(/\/deals?\//)
            )
            // ✅ Normalize and extract slug
            .map((href) => {
              const match = href.match(/products\/([^/]+)/);
              return match ? match[1] : null;
            })
            .filter(Boolean)
        ),
      ];

      const items = clean.map((slug) => ({
        title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        url: `https://appsumo.com/products/${slug}/`,
        category: cat,
      }));

      saveJson(`appsumo-${cat}.json`, items);
      results[cat] = items.length;
    } catch (err) {
      console.error(`❌ ${cat} error:`, err.message);
      saveJson(`appsumo-${cat}.json`, []);
    }
  }

  await browser.close();

  const total = Object.values(results).reduce((a, b) => a + b, 0);
  console.log(`\n✅ Wrote ${total} total deals across ${Object.keys(results).length} categories.`);
}

main().catch((err) => {
  console.error("Fatal updateFeed error:", err);
  process.exit(1);
});
