// /api/home.js
// TinmanApps Home Index v5.0 “Active-Only SEO Surface+”
// ───────────────────────────────────────────────────────────────────────────────
// Alignment with updateFeed v7.7:
// • Counts only ACTIVE (non-archived) deals
// • Full taxonomy (ai, marketing, productivity, software, courses, business, web, ecommerce, creative)
// • SEO-first layout with schema correctness
// • Uses Insight Pulse boost ordering if available
// • Zero branding, zero analytics, zero ref leakage
// • 100% Render-safe (FS reads only)
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

// Full taxonomy (must match updateFeed + categories.js + silos)
const CATEGORIES = {
  ai: "AI & Automation Tools",
  marketing: "Marketing & Sales Tools",
  productivity: "Productivity Boosters",
  software: "Software Deals",
  courses: "Courses & Learning",
  business: "Business Management",
  web: "Web & Design Tools",
  ecommerce: "Ecommerce Tools",
  creative: "Creative & Design Tools",
};

// ───────────────────────────────────────────────────────────────────────────────
// Safe JSON loader
// ───────────────────────────────────────────────────────────────────────────────
function loadJsonSafe(file, fallback = []) {
  try {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return fallback;
  }
}

// Optional Insight Pulse data
function loadInsight() {
  try {
    const full = path.join(DATA_DIR, "insight-latest.json");
    if (!fs.existsSync(full)) return null;
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ───────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
    const insight = loadInsight();

    const boostScores =
      insight?.categories
        ? Object.fromEntries(
            Object.entries(insight.categories).map(([k, v]) => [
              k,
              Number(v.boost || 0),
            ])
          )
        : {};

    // Build live category blocks (ACTIVE DEALS ONLY)
    const blocks = Object.entries(CATEGORIES).map(([key, label]) => {
      const silo = loadJsonSafe(`appsumo-${key}.json`, []);

      // active only (align with v7.7 strict-cap output)
      const active = silo.filter((d) => !d.archived);
      const first = active[0];

      return {
        key,
        label,
        count: active.length,
        img:
          first?.image ||
          "https://deals.tinmanapps.com/assets/placeholder.webp",
        boost: boostScores[key] ?? 0,
      };
    });

    // Insight Pulse ordering — boosted categories rise to top
    blocks.sort((a, b) => b.boost - a.boost);

    // ───────────────────────────────────────────────────────────────────────────
    // HTML (clean, SEO-optimised, extremely lightweight)
    // ───────────────────────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Live AppSumo Deals by Category — Auto-Refreshed Daily</title>
<meta name="description" content="Browse live AppSumo lifetime deals organised by category — automatically refreshed and self-optimising." />
<link rel="canonical" href="https://deals.tinmanapps.com/" />

<meta property="og:title" content="Live AppSumo Deals — Updated Automatically" />
<meta property="og:description" content="Explore every active AppSumo deal with adaptive category intelligence and daily refresh." />
<meta property="og:image" content="https://deals.tinmanapps.com/assets/placeholder.webp" />
<meta property="og:type" content="website" />

<style>
  body {
    font-family: system-ui, sans-serif;
    background: #fafafa;
    color: #111;
    margin: 0;
    padding: 2rem;
  }
  h1 { margin-bottom: 1.2rem; font-size: 2rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px,1fr));
    gap: 1.25rem;
    margin-top: 1rem;
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
  h2 { margin: .1rem 0 .35rem; font-size: 1.1rem; }
  p { margin: 0; font-size: .9rem; color: #555; }
  .boost {
    font-size: .75rem;
    color: #008f5a;
    margin-top: .3rem;
  }
</style>
</head>

<body>
<h1>AppSumo Deals by Category</h1>

<div class="grid">
${blocks
  .map(
    (b) => `
  <a class="card" href="/categories/${b.key}">
    <img src="${b.img}" alt="${b.label}" loading="lazy" />
    <h2>${b.label}</h2>
    <p>${b.count} active deals</p>
    ${b.boost ? `<div class="boost">SEO Boost: ${b.boost.toFixed(2)}</div>` : ""}
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
