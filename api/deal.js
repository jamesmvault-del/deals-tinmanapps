// /api/deal.js
// 🎯 TinmanApps Adaptive Deal Page v2.0 (with CTR tracking)
// Generates individual deal pages and logs engagement events

import { CACHE } from "../lib/proxyCache.js";

const BASE_URL = "https://deals.tinmanapps.com";
const TRACK_URL = `${BASE_URL}/api/track`;

// Archetypes for adaptive tone and colour
const ARCHETYPES = {
  software: { label: "Trust & Reliability", color: "#4a6cf7", cta: "Built to last — explore" },
  marketing: { label: "Opportunity & Growth", color: "#0ea5e9", cta: "Capture your edge — explore" },
  productivity: { label: "Efficiency & Focus", color: "#16a34a", cta: "Streamline your day — explore" },
  ai: { label: "Novelty & Innovation", color: "#9333ea", cta: "Experience the breakthrough — explore" },
  courses: { label: "Authority & Learning", color: "#f59e0b", cta: "Start mastering — explore" }
};

export default async function handler(req, res) {
  const slug = (req.query.slug || "").toLowerCase();
  let found = null, category = "software";

  // Find deal in any category
  for (const [cat, list] of Object.entries(CACHE.categories || {})) {
    found = list.find((d) =>
      d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") === slug
    );
    if (found) { category = cat; break; }
  }

  if (!found) {
    res.status(404).send(`<h1>Deal not found</h1>`);
    return;
  }

  const arch = ARCHETYPES[category] || ARCHETYPES.software;
  const dealTitle = found.title;
  const referral = found.referralUrl;

  // --- Build tracking redirect ---
  const trackingLink = `${TRACK_URL}?deal=${encodeURIComponent(slug)}&cat=${encodeURIComponent(category)}&redirect=${encodeURIComponent(referral)}`;

  // --- Metadata ---
  const title = `${dealTitle} • ${arch.label} | TinmanApps`;
  const desc = `Discover ${dealTitle}, a ${category} tool embodying ${arch.label}. Curated by TinmanApps to deliver reliability, performance, and long-term value.`;
  const canonical = `${BASE_URL}/api/deal?slug=${slug}`;

  // --- Render page ---
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
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${canonical}" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 700px; text-align: center; }
    h1 { color: ${arch.color}; font-size: 2rem; }
    a.button {
      display: inline-block; margin-top: 1.5rem; background: ${arch.color};
      color: #fff; padding: 0.8rem 1.6rem; border-radius: 8px; text-decoration: none;
      font-weight: 600; transition: 0.2s ease; 
    }
    a.button:hover { background: #222; }
    footer { margin-top: 2rem; font-size: 0.9rem; color: #777; }
  </style>
</head>
<body>
  <h1>${dealTitle}</h1>
  <p><em>Archetype:</em> ${arch.label}</p>
  <a class="button" href="${trackingLink}" rel="nofollow">${arch.cta} ${dealTitle} →</a>
  <footer>Generated ${new Date().toLocaleString()}</footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
}
