// /scripts/updateFeed.js
// 🚀 TinmanApps AppSumo Feed Builder v8 — Stable Puppeteer Edition
// Works natively on GitHub Actions + Render (no Lambda dependencies)

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
  const content = await page.content();
  const match = content.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/
  );
  if (!match) return [];
  const json = JSON.parse(match[1]);
  const deals =
    json?.props?.pageProps?.deals ||
    json?.props?.pageProps?.data?.deals ||
    [];
  return deals.slice(0, 50).map((d) => ({
    title: d.title || "Untitled",
    slug: d.slug || "",
    url: `https://appsumo.com/products/${d.slug}/`,
    image: d.image?.url || d.image || null,
    category
  }));
}

async function main() {
  console.log("🚀 Launching Puppeteer (bundled Chromium)...");
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
