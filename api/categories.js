// /api/categories.js
// 🌐 TinmanApps Adaptive Category Renderer v3.0
// Adds CTR-tracking links for every deal card

import { CACHE } from "../lib/proxyCache.js";

const BASE_URL = "https://deals.tinmanapps.com";
const TRACK_URL = `${BASE_URL}/api/track`;

// Archetype map for tone, colour, and CTA
const ARCHETYPES = {
  software: { label: "Trust & Reliability", color: "#4a6cf7", cta: "Simplify your workflow →" },
  marketing: { label: "Opportunity & Growth", color: "#0ea5e9", cta: "Unlock your next win →" },
  productivity: { label: "Efficiency & Focus", color: "#16a34a", cta: "Work smarter →" },
  ai: { label: "Novelty & Innovation", color: "#9333ea", cta: "Explore this breakthrough →" },
  courses: { label: "Authority & Learning", color: "#f59e0b", cta: "Start mastering today →" }
};

export default async function handler(req, res) {
  const cat = (req.query.cat || "").toLowerCase();
  const archetype = ARCHETYPES[cat] || ARCHETYPES.software;
  const deals = CACHE.categories?.[cat] || [];
  const total = deals.length;

  const title = `${cat.charAt(0).toUpperCase() + cat.slice(1)} Deals • ${archetype.label} | TinmanApps`;
  const desc = `Explore ${total} active ${cat} deals embodying ${archetype.label} — discover tools, offers, and resources that match your growth mindset.`;
  const canonical = `${BASE_URL}/api/categories?cat=${encodeURIComponent(cat)}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 780px; line-height: 1.6; }
    h1 { color: ${archetype.color}; font-size: 1.8rem; margin-bottom: 0.5rem; }
    .deal { padding: 0.75rem 0; border-bottom: 1px solid #eee; }
    .deal-title { font-weight: 600; font-size: 1.05rem; color: #222; text-decoration: none; }
    .deal-title:hover { color: ${archetype.color}; text-decoration: underline; }
    .cta { color: ${archetype.color}; text-decoration: none; font-size: 0.9rem; }
    .cta:hover { text-decoration: underline; }
    footer { margin-top: 2.5rem; font-size: 0.9rem; color: #888; }
  </style>
</head>
<body>
  <h1>${cat.charAt(0).toUpperCase() + cat.slice(1)} Deals</h1>
  <p><em>Adaptive archetype:</em> ${archetype.label}</p>

  ${deals
    .map((d) => {
      const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const trackingLink = `${TRACK_URL}?deal=${encodeURIComponent(slug)}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(d.referralUrl)}`;
      return `
      <div class="deal">
        <a class="deal-title" href="/api/deal?slug=${slug}">${d.title}</a><br/>
        <a class="cta" href="${trackingLink}" rel="nofollow">${archetype.cta}</a>
      </div>`;
    })
    .join("")}

  <footer>Updated ${new Date().toLocaleString()}</footer>
</body>
</html>
`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
}
