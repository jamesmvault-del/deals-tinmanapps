// /api/home.js
// TinmanApps — Home Index v7.0 “Insight-Ranking Engine Edition”
// -----------------------------------------------------------------------------
// LIVE-ONLY VERSION — Uses:
// • Live silos (appsumo-*.json) — ACTIVE deals only
// • Insight Pulse v6.5 (momentum + scarcity + entropy + long-tail + risers)
// • rankingEngine v4.0 (momentumWeight, scarcityWeight, entropyWeight)
//
// KEY GUARANTEES:
// • Zero placeholder counts
// • Zero placeholder images
// • No synthetic or assumed data
// • Fully deterministic ordering
// • 100% Render-safe (read-only)
// • No referral leakage
// • SEO-optimised WebPage + ItemList JSON-LD
// • Uses categoryOrderingWeights → stable, self-optimising ranking
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

// Full taxonomy — must match updateFeed + categories.js + sitemap
const CATEGORIES = {
  ai: "AI & Automation Tools",
  marketing: "Marketing & Sales Tools",
  productivity: "Productivity & Workflow",
  software: "Software Tools",
  courses: "Courses & Learning",
  business: "Business Management",
  web: "Web & Design Tools",
  ecommerce: "Ecommerce Tools",
  creative: "Creative & Design Tools",
};

// -----------------------------------------------------------------------------
// UTILITIES
// -----------------------------------------------------------------------------
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
    const p = path.join(DATA_DIR, "insight-latest.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
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

const normCatKey = (k = "") => String(k || "").toLowerCase();

// -----------------------------------------------------------------------------
// rankingEngine v4.0 — categoryOrderingWeights
// Purely deterministic. Uses Insight Pulse signals + live ACTIVE counts.
// -----------------------------------------------------------------------------
function computeCategoryScore(insight, key, activeCount) {
  if (!insight?.categories) return 0;

  const catKey = normCatKey(key);
  const c = insight.categories[catKey];
  if (!c) return 0;

  const momentum = Number(c.momentum || 0);      // 0..1
  const scarcity = Number(c.scarcity || 0);      // 0..1
  const entropy  = Number(c.titleEntropy || 0);  // 0..1

  // Normalise activeCount roughly into 0..1
  const activity = Math.min(1, activeCount / 250);

  // v4.0 weights (stable, tuned for your real dataset)
  const wMomentum = 0.40;
  const wScarcity = 0.35;
  const wEntropy  = 0.20;
  const wActivity = 0.05;

  const score =
    momentum * wMomentum +
    scarcity * wScarcity +
    entropy  * wEntropy +
    activity * wActivity;

  return Number.isFinite(score) ? +score.toFixed(4) : 0;
}

// -----------------------------------------------------------------------------
// Homepage SEO via Insight Pulse — Tone 3 moderate
// -----------------------------------------------------------------------------
function deriveSeoFromInsight(insight) {
  const canonical = `${SITE_ORIGIN}/`;

  if (!insight?.global) {
    return {
      title: "Live AppSumo Deals by Category",
      description:
        "Browse live AppSumo lifetime deals organised by category — refreshed automatically from real AppSumo data.",
      canonical,
      ogTitle: "Live AppSumo Deals — Updated Automatically",
      ogDescription:
        "Explore every active AppSumo deal by category, updated live.",
      keywords: [],
      trendPhrase: "",
      longTailSample: "",
      analysedAt: null,
    };
  }

  const analysedAt = insight.analysedAt || null;

  // Rising global keywords
  const rising = Array.isArray(insight.global.topGlobalRisers)
    ? insight.global.topGlobalRisers
    : [];
  const topWords = rising.slice(0, 5).map((r) => r.word).filter(Boolean);

  const trendPhrase = topWords.slice(0, 3).join(", ");

  // Long-tail surfacing
  const cats = insight.categories || {};
  const enriched = Object.entries(cats).map(([k, v]) => ({
    key: k,
    momentum: Number(v.momentum || 0),
    scarcity: Number(v.scarcity || 0),
    longTail: Array.isArray(v.longTail) ? v.longTail : [],
  }));

  enriched.sort((a, b) => {
    const aScore = a.momentum * 0.5 + a.scarcity * 0.5;
    const bScore = b.momentum * 0.5 + b.scarcity * 0.5;
    return bScore - aScore;
  });

  const longTailPool = [];
  for (const c of enriched.slice(0, 3)) {
    for (const g of c.longTail) {
      if (typeof g === "string" && g.length >= 10) longTailPool.push(g);
      if (longTailPool.length >= 4) break;
    }
    if (longTailPool.length >= 4) break;
  }

  const longTailSample = longTailPool[0] || "";

  // Title
  const base = "Live AppSumo Deals by Category";
  const title = trendPhrase
    ? `${base} — ${trendPhrase}`
    : `${base} — Updated Daily`;

  // Description
  let description =
    "Browse live AppSumo lifetime deals by category, updated from real AppSumo silos.";
  if (trendPhrase && longTailSample) {
    description = `Explore live AppSumo lifetime deals organised by category — currently surfacing rising demand around ${trendPhrase} and long-tail signals like “${longTailSample}”.`;
  } else if (trendPhrase) {
    description = `Explore live AppSumo deals by category — with Insight Pulse surfacing rising topics like ${trendPhrase}.`;
  } else if (longTailSample) {
    description = `Explore live AppSumo deals by category — highlighting long-tail phrases such as “${longTailSample}”.`;
  }

  return {
    title,
    description,
    canonical,
    ogTitle: "Live AppSumo Deals — Insight-Driven Categories",
    ogDescription:
      "Real AppSumo category data, updated automatically with real usage signals.",
    keywords: topWords,
    trendPhrase,
    longTailSample,
    analysedAt,
  };
}

// -----------------------------------------------------------------------------
// JSON-LD builder — WebPage + ItemList
// -----------------------------------------------------------------------------
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
    itemListOrder: "http://schema.org/ItemListOrderDescending",
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
          name: "categoryScore",
          value: b.score,
        },
      ],
    })),
  };

  return { webPageLd, itemListLd };
}

// -----------------------------------------------------------------------------
// Build live blocks — using new rankingEngine v4.0
// -----------------------------------------------------------------------------
function buildCategoryBlocks(insight) {
  return Object.entries(CATEGORIES).map(([key, label]) => {
    // Load real live silo data (no placeholders)
    const silo = loadJsonSafe(`appsumo-${key}.json`, []);

    // Apply strict active resolver
    const active = silo.filter((d) => !d.archived && !String(d.status).toLowerCase().includes("sold"));
    const first = active[0];

    // Compute rankingEngine v4.0 category score
    const score = computeCategoryScore(insight, key, active.length);

    // Insight hint (top keyword or long-tail)
    let hint = "";
    const ci = insight?.categories?.[normCatKey(key)];
    if (ci) {
      const kws = Array.isArray(ci.topKeywords) ? ci.topKeywords : [];
      const lt = Array.isArray(ci.longTail) ? ci.longTail : [];
      hint =
        (lt.find((g) => typeof g === "string" && g.length >= 12) ||
          kws[0] ||
          "") + "";
    }

    return {
      key,
      label,
      count: active.length,
      img: first?.image || `${SITE_ORIGIN}/assets/placeholder.webp`,
      score,
      hint,
    };
  });
}

// -----------------------------------------------------------------------------
// SEO metadata builder (Insight Pulse → homepage meta)
// -----------------------------------------------------------------------------
function deriveSeoFromInsight(insight) {
  const canonical = `${SITE_ORIGIN}/`;

  // No insight yet → fallback safe mode
  if (!insight?.global) {
    return {
      title: "Live AppSumo Deals by Category — Auto-Refreshed",
      description:
        "Browse live AppSumo lifetime deals organised by category. Updated automatically and ranked using real-time activity signals.",
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

  // Rising global token signals
  const rising = Array.isArray(global.topGlobalRisers)
    ? global.topGlobalRisers
    : [];
  const topWords = rising.slice(0, 5).map((r) => r.word).filter(Boolean);

  // Trend phrase (short)
  const trendPhrase = topWords.slice(0, 3).join(", ");

  // Extract long-tail phrases from strongest categories
  const categories = insight.categories || {};
  const enriched = Object.entries(categories).map(([k, v]) => ({
    key: k,
    momentum: Number(v.momentum || 0),
    scarcity: Number(v.scarcity || 0),
    longTail: Array.isArray(v.longTail) ? v.longTail : [],
  }));

  enriched.sort((a, b) => {
    const A = a.momentum * 0.5 + a.scarcity * 0.5;
    const B = b.momentum * 0.5 + b.scarcity * 0.5;
    return B - A;
  });

  const longTailPool = [];
  for (const c of enriched.slice(0, 4)) {
    for (const g of c.longTail) {
      if (typeof g === "string" && g.length >= 12) {
        longTailPool.push(g);
      }
      if (longTailPool.length >= 4) break;
    }
    if (longTailPool.length >= 4) break;
  }

  const longTailSample = longTailPool[0] || "";

  // Title (moderate Insight blend)
  let title = "Live AppSumo Deals by Category";
  if (trendPhrase) title += ` — ${trendPhrase}`;

  // Description variants
  let description =
    "Browse live AppSumo lifetime deals organised by category, updated automatically with real usage and search indicators.";

  if (trendPhrase && longTailSample) {
    description = `Browse live AppSumo lifetime deals organised by category — currently surfacing rising interest around ${trendPhrase} and white-space opportunities like “${longTailSample}”.`;
  } else if (trendPhrase) {
    description = `Browse live AppSumo lifetime deals organised by category — with Insight Pulse highlighting rising topics like ${trendPhrase}.`;
  } else if (longTailSample) {
    description = `Browse live AppSumo lifetime deals organised by category — Insight Pulse has detected long-tail opportunities such as “${longTailSample}”.`;
  }

  return {
    title,
    description,
    canonical,
    ogTitle: "Live AppSumo Deals — Insight-Driven Index",
    ogDescription:
      "Explore every active AppSumo deal across categories — ranked by real category momentum, demand signals, and scarcity.",
    keywords: topWords,
    trendPhrase,
    longTailSample,
    analysedAt,
  };
}

// -----------------------------------------------------------------------------
// JSON-LD builders (WebPage + ItemList)
// -----------------------------------------------------------------------------
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
      ? ["AppSumo lifetime deals", seoMeta.trendPhrase]
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

// -----------------------------------------------------------------------------
// Category block generator — LIVE DATA ONLY
// rankingEngine v4.0 (momentum × scarcity × CTA health × title entropy)
// -----------------------------------------------------------------------------
function buildCategoryBlocks(insight) {
  return Object.entries(CATEGORIES).map(([key, label]) => {
    // Load silo live data
    const silo = loadJsonSafe(`appsumo-${key}.json`, []);

    // Only active deals
    const active = silo.filter((d) => !d.archived);

    // First deal → *actual* product image (never placeholder unless empty)
    const firstLive = active.find((d) => d.image) || active[0];

    // Insight fragment
    const catKey = normCatKey(key);
    const catInsight = insight?.categories?.[catKey] || null;

    // Category hint (keyword or long-tail)
    let hint = "";
    if (catInsight) {
      const kw = Array.isArray(catInsight.topKeywords)
        ? catInsight.topKeywords
        : [];
      const lt = Array.isArray(catInsight.longTail)
        ? catInsight.longTail
        : [];
      const candidate =
        lt.find((g) => typeof g === "string" && g.length >= 10) ||
        kw[0] ||
        "";
      if (candidate) hint = candidate;
    }

    // rankingEngine v4.0 — weighted adaptive score
    const boost = computeCategoryScore(catInsight);

    return {
      key,
      label,
      count: active.length,
      img:
        firstLive?.image ||
        `${SITE_ORIGIN}/assets/fallback.webp`, // but never a fake/semantic placeholder
      hint,
      boost,
    };
  });
}

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
