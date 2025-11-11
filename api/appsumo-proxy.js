// /api/appsumo-proxy.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — AppSumo Ingestion + Referral Governor v4.1
// “Deterministic • Referral-Safe • Category-Pure Edition”
//
// WHAT THIS FILE NOW DOES:
// • Loads local AppSumo silos: data/appsumo-*.json
// • Generates SLUGS deterministically
// • Builds **masked referral URLs only** (never external raw links)
// • Inserts placeholder image if missing
// • NEVER generates CTA or subtitle (handled by ctaEngine + seoIntegrity)
// • Ensures SEO fields exist (minimal safe defaults only — no hype)
// • Zero randomness, zero resurrection, zero raw affiliate exposure
// • 100% safe for master-cron + regeneration phases
//
// OUTPUT SHAPE:
// categories: {
//   ai:    [ {title, slug, url, referralUrl, image, category, seo} ],
//   ...etc
// }
//
// The feed-cleanser → normalizer → ctaEngine → seoIntegrity pipeline
// will enrich these safely.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

// ───────────────────────────────────────────────────────────────────────────────
// GLOBAL REFERRAL MASK (do NOT change at runtime)
// Always masked. Never external. No leakage.
// ───────────────────────────────────────────────────────────────────────────────
const MASK_PREFIX = "https://tinmanapps.com/r?url=";

// ───────────────────────────────────────────────────────────────────────────────
// Safe JSON loader
// ───────────────────────────────────────────────────────────────────────────────
function loadJson(filename) {
  try {
    const full = path.join(DATA_DIR, filename);
    if (!fs.existsSync(full)) return [];
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Deterministic slug builder (no randomness ever)
// ───────────────────────────────────────────────────────────────────────────────
function makeSlug(raw = "") {
  const base =
    raw
      .toLowerCase()
      .trim()
      .replace(/https?:\/\/[^/]+\/products\//, "")
      .replace(/[^a-z0-9\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "") || "unknown";

  return base;
}

// ───────────────────────────────────────────────────────────────────────────────
// Minimal SEO object — NEVER generates CTA/SUBTITLE here
// (these are generated later by regenerateSeo → ctaEngine → seoIntegrity)
// ───────────────────────────────────────────────────────────────────────────────
function minimalSeo(deal, category, slug) {
  return {
    clickbait: `Explore ${deal.title || slug}`,
    keywords: [
      category,
      "appsumo",
      "lifetime deal",
      (deal.title || "").toLowerCase(),
    ].filter(Boolean),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Deal normalizer — category-pure, deterministic
// ───────────────────────────────────────────────────────────────────────────────
function normalizeDeal(d, category) {
  const url = d.url || d.link || "";
  const slug = makeSlug(url);

  return {
    title: d.title?.trim() || slug,
    slug,
    category,
    url,
    referralUrl: `${MASK_PREFIX}${encodeURIComponent(url)}`, // ALWAYS masked
    image: d.image || "https://deals.tinmanapps.com/assets/placeholder.webp",
    archived: false,
    seo: minimalSeo(d, category, slug), // CTA/subtitle injected later
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ───────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
    const t0 = Date.now();
    const { cat } = req.query;

    const categories = [
      "software",
      "marketing",
      "productivity",
      "ai",
      "courses",
      "business",
      "web",
      "ecommerce",
      "creative",
    ];

    const data = {};
    let total = 0;

    for (const c of categories) {
      const raw = loadJson(`appsumo-${c}.json`);
      const deals = raw.map((d) => normalizeDeal(d, c));
      data[c] = deals;
      total += deals.length;
    }

    const payload = {
      source: "TinmanApps Proxy v4.1",
      fetchedAt: new Date().toISOString(),
      totalDeals: total,
      byCategory: Object.fromEntries(
        categories.map((c) => [c, data[c]?.length || 0])
      ),
      categories: data,
      integrity: {
        referral: "masked-only",
        cta: "generated-downstream",
        subtitle: "generated-downstream",
        deterministic: true,
      },
      meta: {
        mergeDurationMs: Date.now() - t0,
      },
    };

    // Filter response by category
    if (cat && data[cat]) {
      return res.json({
        source: payload.source,
        category: cat,
        fetchedAt: payload.fetchedAt,
        dealCount: data[cat].length,
        deals: data[cat],
      });
    }

    return res.json(payload);
  } catch (err) {
    console.error("❌ appsumo-proxy error:", err);
    res.status(500).json({ error: "Proxy failure", details: err.message });
  }
}
