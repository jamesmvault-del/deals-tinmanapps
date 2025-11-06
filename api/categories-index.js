// /api/categories-index.js
// Returns a JSON list of all AppSumo categories for the homepage/category list.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

export default function categoriesIndex(req, res) {
  try {
    const categories = [
      { slug: "software", name: "Software Deals" },
      { slug: "marketing", name: "Marketing & Sales Tools" },
      { slug: "productivity", name: "Productivity Boosters" },
      { slug: "ai", name: "AI & Automation Tools" },
      { slug: "courses", name: "Courses & Learning" },
    ];

    const count = (file) => {
      try {
        const json = JSON.parse(
          fs.readFileSync(path.join(DATA_DIR, `appsumo-${file}.json`), "utf8")
        );
        return json.length || 0;
      } catch {
        return 0;
      }
    };

    const withCounts = categories.map((c) => ({
      ...c,
      count: count(c.slug),
    }));

    res.json({
      source: "TinmanApps Adaptive SEO Engine",
      fetchedAt: new Date().toISOString(),
      categories: withCounts,
    });
  } catch (e) {
    console.error("Error in categories-index.js:", e);
    res.status(500).json({ error: "Failed to load categories" });
  }
}
