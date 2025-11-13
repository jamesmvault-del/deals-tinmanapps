// /api/home.js
// TinmanApps Home Index v6.0 “Insight-Pulse SEO Surface+”
// ───────────────────────────────────────────────────────────────────────────────
// Alignment:
// • Counts only ACTIVE (non-archived) deals
// • Full taxonomy (ai, marketing, productivity, software, courses, business, web, ecommerce, creative)
// • SEO-first layout, JSON-LD WebPage + ItemList
// • Uses Insight Pulse (global + per-category) for:
//     - category ordering (momentum + scarcity + entropy)
//     - homepage title/description enrichment
//     - subtle long-tail / white-space surfacing (Tone 3, moderate)
// • Zero branding, zero analytics, zero referral leakage
// • 100% Render-safe (FS reads only, no writes)
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

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
// Helpers
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

function loadInsight() {
  try {
    const full = path.join(DATA_DIR, "insight-latest.json");
    if (!fs.existsSync(full)) return null;
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Normalise category key to match Insight structure
function normCatKey(k = "") {
  return String(k || "").toLowerCase();
}

// Compute a deterministic “boost” score per category from Insight Pulse
// Blend momentum, scarcity and title entropy (all 0..1 proxies)
function computeBoostForCategory(insight, key) {
  if (!insight?.categories) return 0;
  const catKey = normCatKey(key);
  const c = insight.categories[catKey];
  if (!c) return 0;

  const momentum = Number(c.momentum || 0); // fresh/live activity
  const scarcity = Number(c.scarcity || 0); // white-space opportunity
  const entropy = Number(c.titleEntropy || 0); // diversity of titles

  // Weighted blend (Tone 3 — moderate, not extreme)
  // Momentum + scarcity dominate, entropy softens tie-breaks.
  const boost = momentum * 0.45 + scarcity * 0.35 + entropy * 0.2;
  return Number.isFinite(boost) ? +boost.toFixed(3) : 0;
}

// Derive homepage SEO metadata from Insight Pulse (Tone 3: Moderate)
function deriveSeoFromInsight(insight) {
  const canonical = `${SITE_ORIGIN}/`;

  if (!insight?.global) {
    return {
      title: "Live AppSumo Deals by Category — Auto-Refreshed Daily",
      description:
        "Browse live AppSumo lifetime deals organised by category — automatically refreshed and self-optimising.",
      canonical,
      ogTitle: "Live AppSumo Deals — Updated Automatically",
      ogDescription:
        "Explore every active AppSumo deal across AI, marketing, productivity and more — refreshed and organised by category.",
      keywords: [],
      trendPhrase: "",
      longTailSample: "",
      analysedAt: null,
    };
  }

  const global = insight.global;
  const analysedAt = insight.analysedAt || null;

  const rising = Array.isArray(global.topGlobalRisers)
    ? global.topGlobalRisers
    : [];
  const topWords = rising.slice(0, 5).map((r) => r.word).filter(Boolean);

  // Build a short, safe trend phrase
  const trendPhrase = topWords.slice(0, 3).join(", ");

  // Aggregate long-tail grams from the strongest categories
  const categories = insight.categories || {};
  const enrichedCats = Object.entries(categories).map(([k, v]) => ({
    key: k,
    momentum: Number(v.momentum || 0),
    scarcity: Number(v.scarcity || 0),
    longTail: Array.isArray(v.longTail) ? v.longTail : [],
  }));

  enrichedCats.sort((a, b) => {
    const scoreA = a.momentum * 0.5 + a.scarcity * 0.5;
    const scoreB = b.momentum * 0.5 + b.scarcity * 0.5;
    return scoreB - scoreA;
  });

  const longTailPool = [];
  for (const c of enrichedCats.slice(0, 3)) {
    for (const g of c.longTail) {
      if (typeof g === "string" && g.length >= 10) {
        longTailPool.push(g);
      }
      if (longTailPool.length >= 4) break;
    }
    if (longTailPool.length >= 4) break;
  }

  const longTailSample = longTailPool[0] || "";

  // Title (Tone 3: moderate blend of brand + trend)
  let titleBase = "Live AppSumo Deals by Category";
  let title = titleBase;
  if (trendPhrase) {
    title = `${titleBase} — ${trendPhrase}`;
  } else {
    title = `${titleBase} — Auto-Refreshed Daily`;
  }

  // Description: include rising terms + long-tail phrase, but keep natural
  let desc =
    "Browse live AppSumo lifetime deals organised by category, updated automatically with real usage and search signals.";
  if (trendPhrase && longTailSample) {
    desc = `Browse live AppSumo lifetime deals organised by category. Currently surfacing rising demand around ${trendPhrase} and long-tail opportunities like “${longTailSample}”.`;
  } else if (trendPhrase) {
    desc = `Browse live AppSumo lifetime deals organised by category — with Insight Pulse highlighting rising topics like ${trendPhrase}.`;
  } else if (longTailSample) {
    desc = `Browse live AppSumo lifetime deals organised by category, with Insight Pulse surfacing white-space phrases such as “${longTailSample}”.`;
  }

  // OG meta can be slightly more general
  const ogTitle = "Live AppSumo Deals — Insight-Driven Categories";
  const ogDescription =
    "Explore every active AppSumo deal across AI, marketing, productivity, web, ecommerce and more — ranked by real momentum and opportunity.";

  return {
    title,
    description: desc,
    canonical,
    ogTitle,
    ogDescription,
    keywords: topWords,
    trendPhrase,
    longTailSample,
    analysedAt,
  };
}

// Build homepage JSON-LD snippets: WebPage + ItemList of categories
function buildJsonLd(blocks, seoMeta) {
  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: seoMeta.title,
    url: seoMeta.canonical,
    description: seoMeta.description,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      name: "AppSumo Deals Index",
      url: SITE_ORIGIN,
    },
    about: seoMeta.trendPhrase
      ? [`AppSumo lifetime deals`, seoMeta.trendPhrase]
      : ["AppSumo lifetime deals"],
    keywords: seoMeta.keywords,
    dateModified: seoMeta.analysedAt || undefined,
  };

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "AppSumo Deals by Category",
    url: seoMeta.canonical,
    itemListOrder: "http://schema.org/ItemListOrderAscending",
    numberOfItems: blocks.length,
    itemListElement: blocks.map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE_ORIGIN}/categories/${b.key}`,
      name: b.label,
      additionalProperty: [
        {
          "@type": "PropertyValue",
          name: "activeDeals",
          value: b.count,
        },
        {
          "@type": "PropertyValue",
          name: "insightBoost",
          value: b.boost,
        },
      ],
    })),
  };

  return { webPageLd, itemListLd };
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ───────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
    const insight = loadInsight();

    // Derive SEO meta from Insight Pulse (Tone 3)
    const seoMeta = deriveSeoFromInsight(insight);

    // Build live category blocks (ACTIVE DEALS ONLY)
    const blocks = Object.entries(CATEGORIES).map(([key, label]) => {
      const silo = loadJsonSafe(`appsumo-${key}.json`, []);

      const active = silo.filter((d) => !d.archived);
      const first = active[0];

      // Pull a small hint from Insight per category (top keyword or long-tail)
      let hint = "";
      const catKey = normCatKey(key);
      const catInsight = insight?.categories?.[catKey];

      if (catInsight) {
        const kws = Array.isArray(catInsight.topKeywords)
          ? catInsight.topKeywords
          : [];
        const lt = Array.isArray(catInsight.longTail)
          ? catInsight.longTail
          : [];
        const candidate =
          (lt.find((g) => typeof g === "string" && g.length >= 10) ||
            kws[0] ||
            "") + "";
        if (candidate) {
          hint = candidate;
        }
      }

      const boost = computeBoostForCategory(insight, key);

      return {
        key,
        label,
        count: active.length,
        img:
          first?.image ||
          `${SITE_ORIGIN}/assets/placeholder.webp`,
        boost,
        hint,
      };
    });

    // Insight Pulse ordering — boosted categories rise to top
    blocks.sort((a, b) => b.boost - a.boost);

    const { webPageLd, itemListLd } = buildJsonLd(blocks, seoMeta);

    // Short subheading line referencing Insight Pulse
    const analysedText = seoMeta.analysedAt
      ? `Insight Pulse updated at ${new Date(seoMeta.analysedAt).toISOString().slice(0, 10)}`
      : "Insight Pulse monitoring live categories";

    const trendLine =
      seoMeta.trendPhrase || seoMeta.longTailSample
        ? `Currently surfacing rising demand around ${
            seoMeta.trendPhrase || "live deal activity"
          }${
            seoMeta.longTailSample
              ? ` and long-tail phrases like “${seoMeta.longTailSample}”.`
              : "."
          }`
        : "Auto-refreshed from live AppSumo category silos.";

    // ───────────────────────────────────────────────────────────────────────────
    // HTML (SEO-optimised, lightweight, Insight-aware)
// ───────────────────────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(seoMeta.title)}</title>
<meta name="description" content="${escapeHtml(seoMeta.description)}" />
<link rel="canonical" href="${escapeHtml(seoMeta.canonical)}" />

<meta property="og:title" content="${escapeHtml(seoMeta.ogTitle)}" />
<meta property="og:description" content="${escapeHtml(seoMeta.ogDescription)}" />
<meta property="og:image" content="${SITE_ORIGIN}/assets/placeholder.webp" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtml(seoMeta.canonical)}" />
${seoMeta.keywords.length
  ? `<meta name="keywords" content="${escapeHtml(seoMeta.keywords.join(", "))}" />`
  : ""}

<style>
  :root {
    --bg:#fafafa;
    --card:#ffffff;
    --fg:#101326;
    --muted:#5f667b;
    --accent:#2a63f6;
    --shadow:0 2px 8px rgba(10,14,29,0.06);
    --shadow-hover:0 10px 24px rgba(10,14,29,0.12);
  }
  *{box-sizing:border-box;}
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--fg);
    margin: 0;
    padding: 24px 16px 40px;
  }
  main {
    max-width: 1120px;
    margin: 0 auto;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 1.9rem;
    letter-spacing: -0.02em;
  }
  .sub {
    margin: 0 0 16px;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .trend {
    font-size: 0.85rem;
    color: var(--muted);
    margin-bottom: 18px;
  }
  .trend strong {
    color: var(--accent);
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px,1fr));
    gap: 1.2rem;
    margin-top: 0.5rem;
  }
  a.card {
    display: block;
    background: var(--card);
    border-radius: 14px;
    padding: 1.1rem 1.1rem 1.0rem;
    text-decoration: none;
    color: var(--fg);
    box-shadow: var(--shadow);
    transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
    border: 1px solid rgba(10,14,29,0.04);
  }
  a.card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-hover);
    border-color: rgba(42,99,246,0.22);
  }
  .card img {
    width: 100%;
    border-radius: 10px;
    margin-bottom: .6rem;
    background: #eef1f6;
    height: 140px;
    object-fit: cover;
  }
  h2 {
    margin: .1rem 0 .25rem;
    font-size: 1.05rem;
  }
  p {
    margin: 0;
    font-size: .9rem;
    color: var(--muted);
  }
  .boost {
    font-size: .78rem;
    color: #008f5a;
    margin-top: .4rem;
  }
  .hint {
    font-size: .78rem;
    color: var(--muted);
    margin-top: .25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

<script type="application/ld+json">
${JSON.stringify(webPageLd)}
</script>
<script type="application/ld+json">
${JSON.stringify(itemListLd)}
</script>
</head>

<body>
<main>
  <header>
    <h1>AppSumo Deals by Category</h1>
    <p class="sub">${escapeHtml(analysedText)}</p>
    <p class="trend">${escapeHtml(trendLine)}</p>
  </header>

  <section class="grid">
${blocks
  .map((b) => {
    const hintLine = b.hint
      ? `<div class="hint">Trending: ${escapeHtml(b.hint)}</div>`
      : "";
    const boostLine =
      b.boost && b.boost > 0.01
        ? `<div class="boost">Insight boost: ${b.boost.toFixed(2)}</div>`
        : "";
    return `
    <a class="card" href="/categories/${escapeHtml(b.key)}">
      <img src="${escapeHtml(b.img)}" alt="${escapeHtml(b.label)}" loading="lazy" />
      <h2>${escapeHtml(b.label)}</h2>
      <p>${b.count} active deals</p>
      ${boostLine}
      ${hintLine}
    </a>`;
  })
  .join("\n")}
  </section>
</main>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("❌ Home render error:", err);
    res.status(500).send("Internal server error.");
  }
}
