// /api/categories-index.js
// TinmanApps — Category Index v5.0 “Active-Only • Deterministic • SEO-Core”
// ───────────────────────────────────────────────────────────────────────────────
// • Fully aligned with updateFeed v7.7 + categories.js v7.2 + home.js v7+
// • Counts ONLY ACTIVE (non-archived) deals
// • Deterministic output (sorted taxonomy order)
// • Zero ranking, zero mutation — pure reflector layer
// • Insight Pulse–ready, Sitemap–ready, Cron–safe
// • No scraped contamination, no heuristics
// • Perfect for SEO surfaces & dashboards
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

// Master taxonomy — MUST match categories.js + sitemap + homepage
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

export default function handler(req, res) {
  try {
    const timestamp = new Date().toISOString();

    // Deterministic category mapping
    const categories = CATEGORIES.map((c) => {
      const raw = loadJsonSafe(`appsumo-${c.slug}.json`);
      const active = raw.filter((d) => !d.archived).length;

      return {
        slug: c.slug,
        name: c.name,
        active,
        total: raw.length,
      };
    });

    res.json({
      source: "TinmanApps SEO Core",
      version: "v5.0",
      generated: timestamp,
      categories,
    });
  } catch (err) {
    console.error("❌ categories-index error:", err);
    res.status(500).json({ error: "Failed to build categories index" });
  }
}
