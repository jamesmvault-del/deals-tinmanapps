// /api/home.js
// 🏠 TinmanApps Adaptive SEO Home Index
// Displays all available categories with live counts and meta preview

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../data");

const CATEGORIES = {
  software: "Software Deals",
  marketing: "Marketing & Sales Tools",
  productivity: "Productivity Boosters",
  ai: "AI & Automation Tools",
  courses: "Courses & Learning"
};

// ✅ Safe JSON loader
function loadJson(file) {
  try {
    const fullPath = path.join(dataDir, file);
    if (fs.existsSync(fullPath)) {
      const raw = fs.readFileSync(fullPath, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("❌ Failed to load JSON:", err);
  }
  return [];
}

export default async function home(req, res) {
  try {
    const categories = Object.keys(CATEGORIES).map((key) => {
      const data = loadJson(`appsumo-${key}.json`);
      return {
        key,
        title: CATEGORIES[key],
        count: data.length,
        image:
          data[0]?.image ||
          "https://deals.tinmanapps.com/assets/placeholder.webp"
      };
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AppSumo Deals Index | TinmanApps Adaptive SEO System</title>
<meta name="description" content="Browse live AppSumo deals indexed by TinmanApps — automatically refreshed and optimized for SEO, CTR, and referral performance." />
<meta property="og:title" content="AppSumo Deals Index | TinmanApps" />
<meta property="og:description" content="Live adaptive deal index powered by TinmanApps SEO engine." />
<meta property="og:image" content="https://deals.tinmanapps.com/assets/placeholder.webp" />
<style>
  body { font-family: system-ui, sans-serif; background:#f5f5f5; color:#111; margin:0; padding:2rem; }
  h1 { font-size:2rem; margin-bottom:1rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1rem; }
  a.card { background:#fff; border-radius:12px; padding:1.5rem; text-decoration:none; color:#111; box-shadow:0 2px 6px rgba(0,0,0,0.1); transition:transform .2s ease; }
  a.card:hover { transform:translateY(-4px); box-shadow:0 4px 12px rgba(0,0,0,0.15); }
  img { width:100%; border-radius:8px; margin-bottom:0.8rem; }
  h2 { margin:0.3rem 0; font-size:1.1rem; }
  p { margin:0; color:#555; font-size:0.9rem; }
  footer { margin-top:2rem; text-align:center; font-size:0.8rem; color:#888; }
</style>
</head>
<body>
<h1>AppSumo Deal Categories</h1>
<div class="grid">
${categories
  .map(
    (c) => `
    <a class="card" href="/categories/${c.key}">
      <img src="${c.image}" alt="${c.title}" loading="lazy"/>
      <h2>${c.title}</h2>
      <p>${c.count} live deals</p>
    </a>`
  )
  .join("\n")}
</div>
<footer>Powered by TinmanApps Adaptive SEO Engine</footer>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("❌ Home render error:", err);
    res.status(500).send("Internal server error.");
  }
}
