// /api/categories-index.js
// TinmanApps — Category Index v11.0 “SEO Health Pack Edition”
// ───────────────────────────────────────────────────────────────────────────────
// • Fully aligned with updateFeed v10.x + Insight Pulse v6 + CTA Engine
// • Counts ONLY ACTIVE (non-archived) deals
// • Adds Pack-B SEO metrics extracted from insight-latest.json:
//     - topKeywords[0..4]
//     - longTail[0..4]
//     - momentum
//     - churnRate
//     - ctaAvgLen
//     - subAvgLen
//     - dupTokenRate
// • Deterministic taxonomy + stable ordering
// • Lightweight, Render-safe, zero mutation
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

const INSIGHT_PATH = path.join(DATA_DIR, "insight-latest.json");

// MASTER TAXONOMY — MUST remain synced with categories.js + homepage + sitemap
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
  try {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) return [];
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return [];
  }
}

// Safe object loader
function loadInsights() {
  try {
    if (!fs.existsSync(INSIGHT_PATH)) return null;
    return JSON.parse(fs.readFileSync(INSIGHT_PATH, "utf8"));
  } catch {
    return null;
  }
}

// Compute duplicate-token rate for a list of strings
function dupTokenRate(strings = []) {
  if (!strings.length) return 0;
  let bad = 0;
  const re = /\b(\w+)\s+\1\b/i;
  for (const s of strings) if (re.test(String(s))) bad++;
  return +(bad / strings.length).toFixed(3);
}

// Compute average length safely
function avgLen(strings = []) {
  if (!strings.length) return 0;
  const sum = strings.reduce((a, s) => a + String(s).trim().length, 0);
  return +(sum / strings.length).toFixed(1);
}

// Extract active CTA+subtitle health from silo entries
function extractActiveHealth(activeItems) {
  const ctas = [];
  const subs = [];
  for (const d of activeItems) {
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

// ───────────────────────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────────────────────
export default function handler(req, res) {
  try {
    const timestamp = new Date().toISOString();
    const insight = loadInsights();

    const categories = CATEGORIES.map((c) => {
      const raw = loadJsonSafe(`appsumo-${c.slug}.json`);
      const active = raw.filter((d) => !d.archived);

      // Pack B Health: CTA + Subtitle health
      const health = extractActiveHealth(active);

      // Insight Pulse fields
      const fromInsight = insight?.categories?.[c.slug] || {};
      const topKeywords = Array.isArray(fromInsight.topKeywords)
        ? fromInsight.topKeywords.slice(0, 5)
        : [];
      const longTail = Array.isArray(fromInsight.longTail)
        ? fromInsight.longTail.slice(0, 5)
        : [];
      const momentum = Number(fromInsight.momentum || 0);
      const churnRate = Number(fromInsight?.churn?.churnRate || 0);

      return {
        slug: c.slug,
        name: c.name,
        active: active.length,
        total: raw.length,
        topKeywords,
        longTail,
        momentum,
        churnRate,
        ctaAvgLen: health.ctaAvgLen,
        subAvgLen: health.subAvgLen,
        dupTokenRate: health.dupTokenRate,
      };
    });

    // JSON-LD (SEO dashboards + external services)
    const ld = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "TinmanApps Category Index",
      numberOfItems: categories.length,
      itemListElement: categories.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        url: `https://deals.tinmanapps.com/categories/${c.slug}`,
      })),
    };

    const payload = {
      source: "TinmanApps SEO Core",
      version: "v11.0",
      engineVersion: CTA_ENGINE_VERSION,
      generated: timestamp,
      totalCategories: categories.length,
      categories,
      structuredData: ld,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=120");
    res.status(200).json(payload);

    console.log(
      `✅ [CategoryIndex v11] Generated ${categories.length} categories • Engine:${CTA_ENGINE_VERSION}`
    );
  } catch (err) {
    console.error("❌ [CategoryIndex] Error:", err);
    res.status(500).json({ error: "Failed to build categories index" });
  }
}
