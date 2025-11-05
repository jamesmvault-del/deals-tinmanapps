// /api/categories.js
// 🧭 TinmanApps SEO Category Renderer
// Generates static-style HTML per category with adaptive metadata

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../data");

// ✅ Category names & titles
const CATEGORIES = {
  software: "Software Deals",
  marketing: "Marketing & Sales Tools",
  productivity: "Productivity Boosters",
  ai: "AI & Automation Tools",
  courses: "Courses & Learning"
};

// ✅ Referral prefix
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// ✅ Safe JSON loader
function loadJson(file) {
  try {
    const p = path.join(dataDir, file);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error("❌ Failed to load:", file, e);
  }
  return [];
}

// ✅ Helper to build HTML cards
function renderDealCard(deal) {
  return `
  <a class="deal" href="/api/track?deal=${encodeURIComponent(
    deal.slug
  )}&cat=${encodeURIComponent(deal.category)}&redirect=${encodeURIComponent(
    deal.referralUrl
  )}" target="_blank" rel="noopener">
    <img src="${deal.image}" alt="${deal.title}" loading="lazy"/>
    <h3>${deal.title}</h3>
    <p>${deal.seo?.cta || "Unlock deal →"}</p>
  </a>`;
}

// ✅ Main handler
export default async function categories(req, res) {
  try {
    const cat = req.path.split("/").pop();
    const title = CATEGORIES[cat] || "Deals";
    const deals = loadJson(`appsumo-${cat}.json`);

    if (!deals.length) {
      return res
        .status(404)
        .send(`<h1>No deals found for ${title}</h1><p>Please check back soon.</p>`);
    }

    // ✅ SEO meta
    const metaTitle = `${title} | TinmanApps`;
    const metaDesc = `Browse the latest ${title} from AppSumo — automatically indexed and updated for maximum value.`;
    const metaUrl = `https://deals.tinmanapps.com/categories/${cat}`;
    const metaImg = deals[0]?.image || `https://deals.tinmanapps.com/assets/placeholder.webp`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${metaTitle}</title>
<meta name="description" content="${metaDesc}" />
<meta property="og:title" content="${metaTitle}" />
<meta property="og:description" content="${metaDesc}" />
<meta property="og:image" content="${metaImg}" />
<meta property="og:url" content="${metaUrl}" />
<link rel="canonical" href="${metaUrl}" />
<style>
  body { font-family: system-ui, sans-serif; background:#fafafa; color:#111; margin:0; padding:2rem; }
  h1 { font-size:1.8rem; margin-bottom:1rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1rem; }
  .deal { background:#fff; border-radius:12px; padding:1rem; box-shadow:0 2px 6px rgba(0,0,0,0.1); text-decoration:none; color:inherit; transition:transform .2s ease; }
  .deal:hover { transform:translateY(-4px); box-shadow:0 4px 10px rgba(0,0,0,0.15); }
  img { width:100%; border-radius:8px; }
  h3 { margin:0.5rem 0 0.3rem; font-size:1rem; }
  p { color:#555; margin:0; font-size:0.9rem; }
  footer { margin-top:2rem; text-align:center; font-size:0.8rem; color:#888; }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="grid">
${deals.slice(0, 100).map(renderDealCard).join("\n")}
</div>
<footer>Powered by TinmanApps Adaptive SEO Engine</footer>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("❌ Category render error:", err);
    res.status(500).send("Server error.");
  }
}
