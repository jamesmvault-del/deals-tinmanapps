// /api/deal.js
// 🎯 TinmanApps Adaptive Deal Renderer v3.0
// Schema-rich, CTR-aware, fully indexable deal page generator

import { CACHE } from "../lib/proxyCache.js";
import fs from "fs";
import path from "path";

const CTR_PATH = path.resolve("./data/ctr-insights.json");
const BASE_URL = "https://deals.tinmanapps.com";
const TRACK_URL = `${BASE_URL}/api/track`;

function loadCTR() {
  try {
    return JSON.parse(fs.readFileSync(CTR_PATH, "utf8"));
  } catch {
    return { byDeal: {} };
  }
}

// archetypes per category
const ARCHETYPES = {
  software: { color: "#4a6cf7", tone: "Trust & Reliability" },
  marketing: { color: "#0ea5e9", tone: "Opportunity & Growth" },
  productivity: { color: "#16a34a", tone: "Efficiency & Focus" },
  ai: { color: "#9333ea", tone: "Novelty & Innovation" },
  courses: { color: "#f59e0b", tone: "Authority & Learning" }
};

// CTA evolution
const CTA_BASE = [
  "Discover how it transforms →",
  "Start exploring →",
  "Try it now →",
  "See how it works →",
  "Unlock access →"
];

function adaptiveCTA(slug, ctrData) {
  const clicks = ctrData.byDeal?.[slug] || 0;
  const idx = Math.min(Math.floor(clicks / 5), CTA_BASE.length - 1);
  return CTA_BASE[idx];
}

export default async function handler(req, res) {
  const slug = (req.query.slug || "").toLowerCase();
  if (!slug) {
    res.status(400).send("Missing slug");
    return;
  }

  // find deal from cache
  let found;
  let foundCat;
  for (const [cat, deals] of Object.entries(CACHE.categories || {})) {
    found = deals.find((d) => d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") === slug);
    if (found) { foundCat = cat; break; }
  }

  if (!found) {
    res.status(404).send("Deal not found");
    return;
  }

  const ctrData = loadCTR();
  const archetype = ARCHETYPES[foundCat] || ARCHETYPES.software;
  const cta = adaptiveCTA(slug, ctrData);

  const pageUrl = `${BASE_URL}/api/deal?slug=${slug}`;
  const trackLink = `${TRACK_URL}?deal=${encodeURIComponent(slug)}&cat=${encodeURIComponent(foundCat)}&redirect=${encodeURIComponent(found.referralUrl)}`;

  const schema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": found.title,
    "category": foundCat,
    "url": pageUrl,
    "brand": "AppSumo",
    "description": `Exclusive ${foundCat} deal featured via TinmanApps — ${archetype.tone} archetype.`,
    "offers": {
      "@type": "Offer",
      "url": trackLink,
      "availability": "https://schema.org/InStock"
    }
  };

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${found.title} • ${archetype.tone}</title>
  <meta name="description" content="Discover ${found.title} — a ${foundCat} deal representing ${archetype.tone}. Click to explore via TinmanApps."/>
  <link rel="canonical" href="${pageUrl}"/>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 720px; line-height: 1.6; }
    h1 { color: ${archetype.color}; font-size: 1.8rem; margin-bottom: 0.5rem; }
    p { color: #333; }
    a.cta { display: inline-block; margin-top: 1rem; color: ${archetype.color}; text-decoration: none; font-weight: 600; }
    a.cta:hover { text-decoration: underline; }
    footer { margin-top: 2rem; font-size: 0.9rem; color: #777; }
  </style>
</head>
<body>
  <h1>${found.title}</h1>
  <p><em>Category:</em> ${foundCat.charAt(0).toUpperCase() + foundCat.slice(1)} • Archetype: ${archetype.tone}</p>
  <p>This deal is part of TinmanApps’ world-class adaptive SEO system — built for maximum visibility, value, and referral integrity.</p>
  <a class="cta" href="${trackLink}" rel="nofollow">${cta}</a>
  <footer>Last updated ${new Date().toLocaleString()}</footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
}
