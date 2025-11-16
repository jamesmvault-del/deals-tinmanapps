// /api/categories-index.js
// TinmanApps — Category Index v12.0 “Momentum-Weighted SEO Index Edition”
// ───────────────────────────────────────────────────────────────────────────────
// Fully aligned with:
//   • updateFeed v11.1
//   • FeedNormalizer v7.0
//   • DealActive v3
//   • Insight Pulse v6.5 (Opportunity Brain)
//   • CTA Engine v11.2
//   • Homepage + categories.js + sitemap.js (canonical taxonomy)
//
// Guarantees:
// • ACTIVE-ONLY counts (DealActive v3 rules)
// • Momentum-aware ordering (optional via ?sort=momentum)
// • Referral integrity health per category
// • SEO Pack-B metrics:
//     - topKeywords[0..4]
//     - longTail[0..4]
//     - momentum
//     - churnRate
//     - ctaAvgLen
//     - subAvgLen
//     - dupTokenRate
//     - opportunityScore
// • JSON-LD export for external indexing
// • Deterministic, render-safe, zero mutation
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";
import { isActiveDeal } from "../lib/dealActive.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");
const INSIGHT_PATH = path.join(DATA_DIR, "insight-latest.json");

// Canonical taxonomy — must match homepage, categories.js & sitemap.js
const CATEGORIES = [
  { slug: "software",     name: "Software Tools" },
  { slug: "marketing",    name: "Marketing & Sales Tools" },
  { slug: "productivity", name: "Productivity & Workflow" },
  { slug: "ai",           name: "AI & Automation Tools" },
  { slug: "courses",      name: "Courses & Learning" },
  { slug: "business",     name: "Business Management" },
  { slug: "web",          name: "Web & Design Tools" },
  { slug: "ecommerce",    name: "Ecommerce Tools" },
  { slug: "creative",     name: "Creative & Design Tools" },
];

// Safe JSON loader
function loadJsonSafe(file) {
  const full = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(full)) return [];
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return [];
  }
}

// Insight Pulse loader
function loadInsights() {
  try {
    if (!fs.existsSync(INSIGHT_PATH)) return null;
    return JSON.parse(fs.readFileSync(INSIGHT_PATH, "utf8"));
  } catch {
    return null;
  }
}

// Duplicate-token rate
function dupTokenRate(strings = []) {
  if (!strings.length) return 0;
  const re = /\b(\w+)\s+\1\b/i;
  let bad = 0;
  for (const s of strings) {
    if (re.test(String(s))) bad++;
  }
  return +(bad / strings.length).toFixed(3);
}

// Average length
function avgLen(strings = []) {
  if (!strings.length) return 0;
  const sum = strings.reduce((a, s) => a + String(s).trim().length, 0);
  return +(sum / strings.length).toFixed(1);
}

// CTA/sub health extraction
function extractActiveHealth(items = []) {
  const ctas = [];
  const subs = [];
  for (const d of items) {
    const cta = d?.seo?.cta;
    const sub = d?.seo?.subtitle;
    if (cta) ctas.push(cta);
    if (sub) subs.push(sub);
  }
  return {
    ctaAvgLen: avgLen(ctas),
    subAvgLen: avgLen(subs),
    dupTokenRate: dupTokenRate([...ctas, ...subs]),
  };
}

// Referral integrity classifier
function referralIntegrity(items = []) {
  let missing = 0;
  let masked = 0;
  let external = 0;

  for (const d of items) {
    const r = d.referralUrl || "";
    if (!r) {
      missing++;
      continue;
    }
    if (r.startsWith("https://deals.tinmanapps.com/api/track")) {
      masked++;
    } else if (/^https?:\/\//i.test(r)) {
      external++;
    } else {
      missing++;
    }
  }
  const total = items.length || 1;
  const pct = (n) => +(n / total).toFixed(2);

  return {
    total,
    masked,
    external,
    missing,
    maskedPct: pct(masked),
    externalPct: pct(external),
    missingPct: pct(missing),
  };
}

// ───────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────
export default function handler(req, res) {
  try {
    const timestamp = new Date().toISOString();
    const insight = loadInsights();

    const rows = CATEGORIES.map((c) => {
      const raw = loadJsonSafe(`appsumo-${c.slug}.json`);

      // Active deals using DealActive v3 (strict)
      const active = raw.filter((d) => isActiveDeal(d));

      // CTA/subtitle health
      const health = extractActiveHealth(active);

      // Insight Pulse data
      const from = insight?.categories?.[c.slug] || {};
      const topKeywords = Array.isArray(from.topKeywords)
        ? from.topKeywords.slice(0, 5)
        : [];
      const longTail = Array.isArray(from.longTail)
        ? from.longTail.slice(0, 5)
        : [];

      const momentum = Number(from.momentum || 0);
      const churnRate = Number(from?.churn?.churnRate || 0);
      const opportunityScore = Number(from?.opportunity?.score || 0);

      // Referral health
      const referral = referralIntegrity(active);

      return {
        slug: c.slug,
        name: c.name,
        active: active.length,
        total: raw.length,
        topKeywords,
        longTail,
        momentum,
        churnRate,
        opportunityScore,
        ctaAvgLen: health.ctaAvgLen,
        subAvgLen: health.subAvgLen,
        dupTokenRate: health.dupTokenRate,
        referralIntegrity: referral,
      };
    });

    // Optional momentum sort
    let output = rows;
    if (req.query.sort === "momentum") {
      output = [...rows].sort(
        (a, b) =>
          b.momentum - a.momentum ||
          b.opportunityScore - a.opportunityScore ||
          a.slug.localeCompare(b.slug)
      );
    }

    // JSON-LD export
    const ld = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "TinmanApps Category Index",
      numberOfItems: output.length,
      itemListElement: output.map((cat, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: cat.name,
        url: `https://deals.tinmanapps.com/categories/${cat.slug}`,
      })),
    };

    const payload = {
      source: "TinmanApps SEO Core",
      version: "v12.0",
      engineVersion: CTA_ENGINE_VERSION,
      generated: timestamp,
      sortMode: req.query.sort || "none",
      totalCategories: output.length,
      categories: output,
      structuredData: ld,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Cache-Control",
      "public, max-age=600, stale-while-revalidate=120"
    );
    res.status(200).json(payload);

    console.log(
      `✅ [CategoryIndex v12] Delivered ${output.length} categories • Engine:${CTA_ENGINE_VERSION}`
    );
  } catch (err) {
    console.error("❌ [CategoryIndex] Error:", err);
    res.status(500).json({ error: "Failed to build categories index" });
  }
}
