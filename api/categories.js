// /api/categories.js
// TinmanApps — Category renderer (SEO-first, referral-safe, adaptive CTA)

import fs from "fs";
import path from "path";
import url from "url";

// ───────────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

// Domain + canonical
const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

// Referral prefix (kept masked)
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// Category map
const CATS = {
  software: "Software Deals",
  marketing: "Marketing & Sales Tools",
  productivity: "Productivity Boosters",
  ai: "AI & Automation Tools",
  courses: "Courses & Learning",
};

// Archetype by category (used for tone + schema)
const ARCH = {
  software: "Trust & Reliability",
  marketing: "Opportunity & Growth",
  productivity: "Efficiency & Focus",
  ai: "Novelty & Innovation",
  courses: "Authority & Learning",
};

// Lightweight CTA pool (rotated deterministically)
const CTA_POOL = [
  "Unlock deal →",
  "Get instant lifetime access →",
  "Explore what it replaces →",
  "Save hours every week →",
  "See real user results →",
  "Compare to your stack →",
];

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function loadJsonSafe(file, fallback = []) {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function fmtDateISO(dt) {
  try {
    return new Date(dt).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// Deterministic CTA selection (stable per slug)
function ctaFor(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return CTA_POOL[hash % CTA_POOL.length];
}

// Build masked referral → /api/track route
function trackedUrl({ slug, cat, url }) {
  const masked = REF_PREFIX + encodeURIComponent(url);
  const track = `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(
    slug
  )}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(masked)}`;
  return track;
}

// Best-effort image (proxy with graceful fallback to placeholder)
function imageFor(slug) {
  // We proxy any plausible CDN path; if it fails, the proxy serves placeholder.
  // This gives us future upgrade room without breaking layout today.
  const guess = `https://appsumo2-cdn.appsumo.com/media/products/${slug}/logo.png`;
  const proxied = `${SITE_ORIGIN}/api/image-proxy?src=${encodeURIComponent(guess)}`;
  return proxied;
}

// ───────────────────────────────────────────────────────────────────────────────
// Main handler
// ───────────────────────────────────────────────────────────────────────────────
export default async function categories(req, res) {
  const cat = String(req.params.cat || "").toLowerCase();
  const title = CATS[cat];

  if (!title) {
    res.status(404).send("Category not found.");
    return;
  }

  // Load category data built by the feed updater
  const deals = loadJsonSafe(`appsumo-${cat}.json`, []);
  const total = deals.length;

  // Load CTR insights if present (to mention freshness)
  const ctr = loadJsonSafe("ctr-insights.json", {
    totalClicks: 0,
    byDeal: {},
    byCategory: {},
    recent: [],
  });

  // Derive "last refreshed" timestamp from repo write time if available
  let lastRefreshed = new Date();
  try {
    const stat = fs.statSync(path.join(DATA_DIR, `appsumo-${cat}.json`));
    lastRefreshed = stat.mtime;
  } catch {}

  // Compute canonical + meta
  const canonical = `${SITE_ORIGIN}/categories/${cat}`;
  const pageTitle = `${title} | AppSumo Lifetime Deals`;
  const pageDesc = `Browse ${total} live ${title.toLowerCase()} indexed automatically — referral-safe, fast, and SEO-optimized.`;

  // Breadcrumb JSON-LD
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Categories",
        item: `${SITE_ORIGIN}/categories`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: title,
        item: canonical,
      },
    ],
  };

  // CollectionPage + ItemList schema for first N items
  const ITEMS_MAX = Math.min(30, total);
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${title} — AppSumo Deals`,
    url: canonical,
    hasPart: {
      "@type": "ItemList",
      itemListElement: deals.slice(0, ITEMS_MAX).map((d, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: d.title,
        url: `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(
          d.slug || d.title?.toLowerCase().replace(/\s+/g, "-")
        )}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(
          REF_PREFIX + encodeURIComponent(d.url)
        )}`,
      })),
    },
  };

  // Build cards
  const cardsHtml = deals
    .map((d) => {
      // Normalize shape (compat with older feeds)
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        d.title?.toLowerCase().replace(/\s+/g, "-") ||
        "deal";
      const img = d.image || imageFor(slug);
      const cta = ctaFor(slug);
      const link = trackedUrl({ slug, cat, url: d.url });

      return `
      <article class="card">
        <img src="${img}" alt="${d.title}" loading="lazy" />
        <h3>${d.title}</h3>
        <a class="cta" href="${link}">${cta}</a>
      </article>`;
    })
    .join("\n");

  // Dynamic micro-footer (SEO signal without visual noise)
  const footerVisible = `Updated automatically • ${total} deals • ${ARCH[cat]}`;
  const footerHidden = `This page indexes verified AppSumo lifetime deals for ${title.toLowerCase()} with referral integrity, CTR optimization, and structured metadata. Refreshed ${fmtDateISO(
    lastRefreshed
  )}.`;

  // HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(pageTitle)}</title>
<link rel="canonical" href="${canonical}" />
<meta name="description" content="${escapeHtml(pageDesc)}" />
<meta property="og:title" content="${escapeHtml(pageTitle)}" />
<meta property="og:description" content="${escapeHtml(pageDesc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${SITE_ORIGIN}/assets/placeholder.webp" />
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />
<style>
  :root { --fg:#0f1220; --muted:#61677c; --card:#ffffff; --bg:#f7f8fb; --shadow:0 2px 8px rgba(10,14,29,.06); }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; }
  header { padding:28px 24px 12px; }
  h1 { margin:0 0 6px; font-size:28px; letter-spacing:-0.01em; }
  .sub { color:var(--muted); font-size:14px; }
  main { padding:12px 16px 32px; max-width:1200px; margin:0 auto; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap:14px; }
  .card { background:var(--card); border-radius:14px; padding:14px; box-shadow:var(--shadow); display:flex; flex-direction:column; gap:10px; }
  .card img { width:100%; height:140px; object-fit:cover; background:#f0f2f6; border-radius:10px; aspect-ratio: 16 / 9; }
  .card h3 { margin:0; font-size:16px; line-height:1.35; letter-spacing:0; }
  .cta { display:inline-block; margin-top:4px; font-size:14px; text-decoration:none; color:#2a63f6; }
  footer { padding:22px 16px 32px; text-align:center; color:var(--muted); font-size:13px; }
  .visually-hidden { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
</style>
<script type="application/ld+json">
${JSON.stringify(breadcrumbLd)}
</script>
<script type="application/ld+json">
${JSON.stringify(itemListLd)}
</script>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">${escapeHtml(ARCH[cat])} • ${total} deals</div>
  </header>

  <main>
    <section class="grid" itemscope itemtype="https://schema.org/ItemList">
      ${cardsHtml || `<p>No deals available right now. Check back soon.</p>`}
    </section>
  </main>

  <footer>
    <div class="visually-hidden">${escapeHtml(footerHidden)}</div>
    ${escapeHtml(footerVisible)}
  </footer>
</body>
</html>`;

  // Cache lightly to help indexing and speed
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  res.send(html);
}

// ───────────────────────────────────────────────────────────────────────────────
// Tiny util for meta safety
// ───────────────────────────────────────────────────────────────────────────────
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
