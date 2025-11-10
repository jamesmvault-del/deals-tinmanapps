// /api/categories-index.js
// TinmanApps — Category Index v4.0 “Active-Only Adaptive Index”
// ───────────────────────────────────────────────────────────────────────────────
// • Full taxonomy (ai, marketing, productivity, software, courses, business, web,
//   ecommerce, creative)
// • Aligns with updateFeed v7.7 + categories.js + home.js
// • Counts ONLY ACTIVE (non-archived) deals
// • Render-safe (FS reads only), deterministic JSON
// • Supports Insight Pulse and sitemap generators
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

// Full category dictionary (must match all other modules)
const CATEGORIES = [
  { slug: "ai", name: "AI & Automation Tools" },
  { slug: "marketing", name: "Marketing & Sales Tools" },
  { slug: "productivity", name: "Productivity Boosters" },
  { slug: "software", name: "Software Deals" },
  { slug: "courses", name: "Courses & Learning" },
  { slug: "business", name: "Business Management" },
  { slug: "web", name: "Web & Design Tools" },
  { slug: "ecommerce", name: "Ecommerce Tools" },
  { slug: "creative", name: "Creative & Design Tools" },
];

// Safe loader returning parsed JSON or []
function loadJsonSafe(file) {
  try {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) return [];
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return [];
  }
}

export default function categoriesIndex(req, res) {
  try {
    const categories = CATEGORIES.map((c) => {
      const json = loadJsonSafe(`appsumo-${c.slug}.json`);
      const activeCount = json.filter((d) => !d.archived).length;

      return {
        slug: c.slug,
        name: c.name,
        active: activeCount,
        total: json.length,
      };
    });

    res.json({
      source: "TinmanApps Adaptive SEO Engine",
      fetchedAt: new Date().toISOString(),
      categories,
    });
  } catch (err) {
    console.error("❌ categories-index error:", err);
    res.status(500).json({ error: "Failed to load categories" });
  }
}
