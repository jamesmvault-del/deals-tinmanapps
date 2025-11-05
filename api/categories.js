// /api/categories.js
// 🧭 Dynamic category page renderer for TinmanApps Deal Engine
// Generates minimal HTML + adaptive metadata + CTR-optimised CTAs

import { CACHE } from "../lib/proxyCache.js";
import { SITE_URL } from "../lib/config.js"; // optional; fallback below

const BASE_URL = SITE_URL || "https://deals.tinmanapps.com";

export default async function handler(req, res) {
  const { cat } = req.query;
  const categories = CACHE.categories || {};
  const insights = CACHE.meta?.insights || {}; // optional linkage later

  if (!cat || !categories[cat]) {
    res
      .status(404)
      .send(`<h1>Category not found</h1><p>Try /categories/software etc.</p>`);
    return;
  }

  const deals = categories[cat];
  const total = deals.length;
  const insight =
    insights[cat] ||
    {}; /* (placeholder if you later pipe Insight data here automatically) */

  // --- Adaptive SEO metadata ---
  const archetype =
    insight.archetype ||
    (cat === "ai"
      ? "Novelty & Innovation"
      : cat === "marketing"
      ? "Opportunity & Growth"
      : cat === "courses"
      ? "Authority & Learning"
      : cat === "productivity"
      ? "Efficiency & Focus"
      : "Trust & Reliability");

  const boost = insight.boost || 0.85;
  const title = `${cat[0].toUpperCase() + cat.slice(1)} Deals • ${archetype}`;
  const description = `Discover the latest ${cat} tools and lifetime deals on AppSumo — curated by TinmanApps. Updated automatically for maximum value, scarcity, and innovation.`;
  const keywords = (insight.topKeywords || [])
    .slice(0, 10)
    .join(", ");

  // --- CTR-optimised CTA phrasing ---
  const ctaPhrases = {
    "Novelty & Innovation": "Explore this breakthrough deal →",
    "Opportunity & Growth": "Grow faster with this offer →",
    "Authority & Learning": "Start mastering this skill →",
    "Efficiency & Focus": "Save hours instantly →",
    "Trust & Reliability": "Simplify your workflow →"
  };
  const cta = ctaPhrases[archetype] || "Check it out →";

  // --- Schema (ItemList) for SEO indexing ---
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${cat} deals`,
    "itemListElement": deals.map((d, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": `${BASE_URL}/deals/${encodeURIComponent(
        d.title.toLowerCase().replace(/\s+/g, "-")
      )}`,
      "name": d.title
    }))
  };

  // --- Render minimal HTML ---
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="keywords" content="${keywords}" />
  <link rel="canonical" href="${BASE_URL}/categories/${cat}" />
  <script type="application/ld+json">${JSON.stringify(itemList)}</script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 780px; line-height: 1.5; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .deal { margin: 1.2rem 0; padding-bottom: 1rem; border-bottom: 1px solid #eee; }
    a { text-decoration: none; color: #0070f3; }
    a:hover { text-decoration: underline; }
    .cta { display: inline-block; margin-top: 0.4rem; font-weight: 500; }
    footer { margin-top: 2rem; font-size: 0.9rem; color: #888; }
  </style>
</head>
<body>
  <h1>${cat[0].toUpperCase() + cat.slice(1)} Deals</h1>
  <p><em>Adaptive archetype:</em> ${archetype} | <em>Boost:</em> ${boost}</p>

  ${deals
    .map(
      (d) => `
    <div class="deal">
      <strong>${d.title}</strong><br/>
      <a href="${d.referralUrl}" class="cta">${cta}</a>
    </div>`
    )
    .join("")}

  <footer>Updated ${new Date(CACHE.fetchedAt).toLocaleString()}</footer>
</body>
</html>
`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
}
