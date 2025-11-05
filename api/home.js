// /api/home.js
// 🏠 TinmanApps SEO Index — streamlined, professional layout (no branding footer)

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

function loadJson(file) {
  try {
    const fullPath = path.join(dataDir, file);
    if (fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, "utf8"));
    }
  } catch {
    return [];
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
<title>AppSumo Deals Index | Live Categories & Offers</title>
<meta name="description" content="Browse live AppSumo deals — organized by category and constantly refreshed by an adaptive SEO engine for maximum reach and referral potential." />
<meta property="og:title" content="AppSumo Deals Index | Live Categories & Offers" />
<meta property="og:description" content="Discover, explore, and track every AppSumo deal in one powerful feed." />
<meta property="og:image" content="https://deals.tinmanapps.com/assets/placeholder.webp" />
<style>
  body { font-family: system-ui, sans-serif; background:#fafafa; color:#111; margin:0; padding:2rem; }
  h1 { font-size:2rem; margin-bottom:1rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1rem; }
  a.card { background:#fff; border-radius:12px; padding:1.5rem; text-decoration:none; color:#111; box-shadow:0 2px 6px rgba(0,0,0,0.08); transition:transform .2s ease; }
  a.card:hover { transform:translateY(-4px); box-shadow:0 4px 12px rgba(0,0,0,0.15); }
  img { width:100%; border-radius:8px; margin-bottom:0.8rem; background:#eee; }
  h2 { margin:0.3rem 0; font-size:1.1rem; }
  p { margin:0; color:#555; font-size:0.9rem; }
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
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("❌ Home render error:", err);
    res.status(500).send("Internal server error.");
  }
}
