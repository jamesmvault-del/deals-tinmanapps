// /api/cta-dump.js
// TinmanApps — CTA & Subtitle JSON Exporter v2.2 “Unified Insight Mode”
// ───────────────────────────────────────────────────────────────────────────────
// Features:
// • Default: returns each category separately (same as before)
// • ?all=1 → unified mode: aggregates all CTAs/subtitles into one combined JSON
// • Includes summary (per-category counts, total deals, total categories)
// • Sorted alphabetically by category and title
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

export default async function handler(req, res) {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));
  const allMode = req.query.all === "1" || req.query.all === "true";
  const output = {};
  const combined = [];

  // ─────────────── Load data ───────────────
  for (const file of files) {
    const cat = file.replace("appsumo-", "").replace(".json", "");
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
      const mapped = data.map((d) => ({
        category: cat,
        title: d.title || "",
        cta: d.seo?.cta || null,
        subtitle: d.seo?.subtitle || null,
      }));

      output[cat] = mapped;
      combined.push(...mapped);
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${file}:`, err.message);
      output[cat] = { error: "failed to parse" };
    }
  }

  // ─────────────── Unified Mode ───────────────
  if (allMode) {
    const summary = {};
    for (const [cat, items] of Object.entries(output)) {
      if (Array.isArray(items)) summary[cat] = items.length;
    }

    const sorted = combined.sort((a, b) => {
      if (a.category === b.category) return a.title.localeCompare(b.title);
      return a.category.localeCompare(b.category);
    });

    const unified = {
      totalDeals: sorted.length,
      categories: Object.keys(summary).length,
      summary,
      deals: sorted,
    };

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(unified, null, 2));
    return;
  }

  // ─────────────── Default (per-category) Mode ───────────────
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(JSON.stringify(output, null, 2));
}
