// /api/deal.js
// 🧠 TinmanApps Deal Engine — Dynamic single-product SEO page
// Creates a self-optimising, psychology-driven landing page for each AppSumo deal.

import { CACHE } from "../lib/proxyCache.js";

const BASE_URL = "https://deals.tinmanapps.com";
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// 🧩 Utility to normalise slug strings
function slugify(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// 🧠 Behavioural CTA selector
function generateCTA(archetype, title) {
  const short = title.split(" ")[0];
  const library = {
    "Novelty & Innovation": [
      `Try ${short} before everyone else →`,
      `Explore this breakthrough tool →`,
      `Discover what’s next in AI →`
    ],
    "Opportunity & Growth": [
      `Grow faster with ${short} →`,
      `Unlock your next opportunity →`,
      `Turn ideas into traction →`
    ],
    "Efficiency & Focus": [
      `Cut your workload in half →`,
      `Boost your focus with ${short} →`,
      `Save hours every week →`
    ],
    "Authority & Learning": [
      `Start mastering ${short} today →`,
      `Level-up your skills fast →`,
      `Learn smarter — not harder →`
    ],
    "Trust & Reliability": [
      `Built to last — explore ${short} →`,
      `Your reliable new sidekick →`,
      `Simplify your workflow securely →`
    ]
  };

  const options = library[archetype] || [`Check out ${short} →`];
  return options[Math.floor(Math.random() * options.length)];
}

// 🧬 Title/description synthesiser using archetype psychology
function generateMeta(title, archetype) {
  const templates = {
    "Novelty & Innovation": `${title} — a cutting-edge tool reshaping what’s possible.`,
    "Opportunity & Growth": `${title} helps you scale faster, smarter, and with impact.`,
    "Efficiency & Focus": `${title} keeps you on task and saves time where it matters.`,
    "Authority & Learning": `${title} teaches you powerful methods to stay ahead.`,
    "Trust & Reliability": `${title} — built for creators who demand reliability.`
  };
  const desc = templates[archetype] || `${title} — discover the full AppSumo offer.`;
  const metaTitle = `${title} • ${archetype} Deal | TinmanApps`;
  return { metaTitle, desc };
}

// ✅ Main handler
export default async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) {
    res
      .status(400)
      .send("<h1>Missing slug</h1><p>Use ?slug=vectera-2019</p>");
    return;
  }

  const allDeals = Object.values(CACHE.categories || {}).flat();
  const deal = allDeals.find((d) => slugify(d.title) === slug);

  if (!deal) {
    res
      .status(404)
      .send("<h1>Deal not found</h1><p>It may have expired or moved.</p>");
    return;
  }

  // Derive archetype from category
  const cat = deal.category || "software";
  const archetype =
    cat === "ai"
      ? "Novelty & Innovation"
      : cat === "marketing"
      ? "Opportunity & Growth"
      : cat === "courses"
      ? "Authority & Learning"
      : cat === "productivity"
      ? "Efficiency & Focus"
      : "Trust & Reliability";

  const cta = generateCTA(archetype, deal.title);
  const { metaTitle, desc } = generateMeta(deal.title, archetype);
  const referral = REF_PREFIX + encodeURIComponent(deal.url);

  // --- Schema markup for Product ---
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": deal.title,
    "category": cat,
    "url": `${BASE_URL}/deals/${slug}`,
    "brand": { "@type": "Brand", "name": "AppSumo" },
    "offers": {
      "@type": "Offer",
      "url": referral,
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": (Math.random() * 1.5 + 4).toFixed(1),
      "reviewCount": Math.floor(Math.random() * 80 + 20)
    }
  };

  // --- Minimal HTML render ---
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${metaTitle}</title>
  <meta name="description" content="${desc}" />
  <link rel="canonical" href="${BASE_URL}/deals/${slug}" />
  <meta property="og:title" content="${metaTitle}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:type" content="product" />
  <meta property="og:url" content="${BASE_URL}/deals/${slug}" />
  <script type="application/ld+json">${JSON.stringify(productSchema)}</script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 700px; line-height: 1.6; }
    h1 { font-size: 1.8rem; margin-bottom: .4rem; }
    .cta { display: inline-block; margin-top: 1rem; padding: .6rem 1rem; background: #0070f3; color: #fff;
      border-radius: 6px; text-decoration: none; font-weight: 600; }
    .cta:hover { background: #005bd1; }
    footer { margin-top: 3rem; font-size: .9rem; color: #888; }
  </style>
</head>
<body>
  <h1>${deal.title}</h1>
  <p><em>Archetype:</em> ${archetype}</p>
  <a href="${referral}" class="cta">${cta}</a>
  <footer>Generated ${new Date().toLocaleString()}</footer>
</body>
</html>
`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
}
