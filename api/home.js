// /api/home.js
// TinmanApps Home Index v4.0 “Adaptive SEO Surface”
// ───────────────────────────────────────────────────────────────────────────────
// Purpose:
// • Render a clean SEO-optimised homepage
// • Pulls live deal counts from per-category JSON files
// • Integrates optional Insight Pulse signals for trend-aware ordering
// • Ultra-lightweight: zero branding, zero analytics clutter
// • Guaranteed Render-safe (FS reads only)
// • No raw URLs, no ref leakage
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

// Category labels (same taxonomy as updateFeed + master-cron)
const CATEGORIES = {
  software: "Software Deals",
  marketing: "Marketing & Sales Tools",
  productivity: "Productivity Boosters",
  ai: "AI & Automation Tools",
  courses: "Courses & Learning"
};

// Safe JSON loader
function loadJsonSafe(file, fallback = []) {
  try {
    const full = path.join(DATA_DIR, file);
    if (fs.existsSync(full)) {
      return JSON.parse(fs.readFileSync(full, "utf8"));
    }
  } catch {}
  return fallback;
}

// Load Insight Pulse metadata if available
function loadInsight() {
  try {
    const p = path.join(DATA_DIR, "insight-latest.json");
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  } catch {}
  return null;
}

export default async function handler(req, res) {
  try {
    const insight = loadInsight();
    const boostScores =
      insight?.categories
        ? Object.fromEntries(
            Object.entries(insight.categories).map(([k, v]) => [k, v.boost || 0])
          )
        : {};

    // Build category blocks
    const blocks = Object.entries(CATEGORIES).map(([key, label]) => {
      const data = loadJsonSafe(`appsumo-${key}.json`, []);
      const first = data[0];

      return {
        key,
        label,
        count: data.length,
        img:
          first?.image ||
          "https://deals.tinmanapps.com/assets/placeholder.webp",
        boost: boostScores[key] ?? 0
      };
    });

    // Sort visually by “boost score” (SEO-relevant ordering)
    blocks.sort((a, b) => b.boost - a.boost);

    // HTML output (CSS-inlined, clean, ultra-fast)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Live AppSumo Deals — Categorised & Auto-Refreshed</title>
<meta name="description" content="Browse live AppSumo deals, organised by category and continuously refreshed through a self-optimising adaptive engine." />
<meta property="og:title" content="Live AppSumo Deals — Categorised & Auto-Refreshed" />
<meta property="og:description" content="Explore every AppSumo deal with enhanced SEO, category intelligence, and adaptive refresh." />
<meta property="og:image" content="https://deals.tinmanapps.com/assets/placeholder.webp" />
<style>
  body {
    font-family: system-ui, sans-serif;
    background: #fafafa;
    color: #111;
    margin: 0;
    padding: 2rem;
  }
  h1 { margin-bottom: 1rem; font-size: 2rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px,1fr));
    gap: 1.25rem;
  }
  a.card {
    display: block;
    background: #fff;
    border-radius: 14px;
    padding: 1.4rem;
    text-decoration: none;
    color: #111;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    transition: transform .2s ease, box-shadow .2s ease;
  }
  a.card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 14px rgba(0,0,0,0.14);
  }
  img {
    width: 100%;
    border-radius: 10px;
    margin-bottom: .7rem;
    background: #eee;
  }
  h2 { margin: .2rem 0 .3rem; font-size: 1.1rem; }
  p { margin: 0; font-size: .9rem; color: #555; }
  .boost {
    font-size: .75rem;
    color: #008f5a;
    margin-top: .3rem;
  }
</style>
</head>
<body>
<h1>AppSumo Deal Categories</h1>

<div class="grid">
${blocks
  .map(
    (b) => `
  <a class="card" href="/categories/${b.key}">
    <img src="${b.img}" alt="${b.label}" loading="lazy" />
    <h2>${b.label}</h2>
    <p>${b.count} live deals</p>
    ${
      b.boost
        ? `<div class="boost">SEO Boost Score: ${b.boost.toFixed(2)}</div>`
        : ""
    }
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
