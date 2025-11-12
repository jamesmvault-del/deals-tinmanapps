// /api/categories-index.js
// TinmanApps — Category Index v10.0 “Active-Only • Engine-Synced • Deterministic SEO Core”
// ───────────────────────────────────────────────────────────────────────────────
// • Fully aligned with updateFeed v10 + categories.js v10 + sitemap v10
// • Counts ONLY ACTIVE (non-archived) deals
// • Deterministic taxonomy order (zero ranking, zero mutation)
// • JSON-LD ready structure for SEO dashboards
// • Engine version exposed for diagnostic sync
// • Insight Pulse–ready, Sitemap–ready, Cron–safe
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

// Master taxonomy — MUST mirror categories.js + sitemap.js + homepage
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

// ───────────────────────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────────────────────
export default function handler(req, res) {
  try {
    const timestamp = new Date().toISOString();

    // Deterministic category mapping (ACTIVE-only counts)
    const categories = CATEGORIES.map((c) => {
      const raw = loadJsonSafe(`appsumo-${c.slug}.json`);
      const activeItems = raw.filter((d) => !d.archived);
      return {
        slug: c.slug,
        name: c.name,
        active: activeItems.length,
        total: raw.length,
      };
    });

    // JSON-LD for potential external use (SEO dashboards)
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
      version: "v10.0",
      engineVersion: CTA_ENGINE_VERSION,
      generated: timestamp,
      totalCategories: categories.length,
      categories,
      structuredData: ld,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=120");
    res.status(200).json(payload);

    console.log(`✅ [CategoryIndex v10] Generated ${categories.length} categories • Engine:${CTA_ENGINE_VERSION}`);
  } catch (err) {
    console.error("❌ [CategoryIndex] Error:", err);
    res.status(500).json({ error: "Failed to build categories index" });
  }
}
