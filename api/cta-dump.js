// /api/cta-dump.js
// TinmanApps — CTA & Subtitle Exporter v9.0
// “Active-Only • Deterministic • SEO-Aligned • Insight-Ready”
// ───────────────────────────────────────────────────────────────────────────────
// Upgrades for v9.0:
// • Reflects CTA Engine v9.0 dynamically
// • Fully deterministic ordering (category → title)
// • Active-only output (archived excluded)
// • Dynamic header (source, version, timestamp)
// • Unified ?all=1 mode → flattened active dataset summary
// • Default mode → per-category active-only export
// • Render-safe, FS-only; zero side-effects
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

export default async function handler(req, res) {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));

  const allMode = req.query.all === "1" || req.query.all === "true";

  const perCategory = {};
  const combined = [];

  // ───────────────────────────────────────────────────────────────
  // Load & map ACTIVE ONLY
  // ───────────────────────────────────────────────────────────────
  for (const file of files) {
    const cat = file.replace("appsumo-", "").replace(".json", "");

    try {
      const full = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));

      const active = full
        .filter((d) => !d.archived)
        .map((d) => ({
          category: cat,
          title: d.title?.trim?.() || "",
          cta: d.seo?.cta?.trim?.() || "",
          subtitle: d.seo?.subtitle?.trim?.() || "",
        }))
        .sort((a, b) => a.title.localeCompare(b.title));

      perCategory[cat] = active;
      combined.push(...active);
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${file}:`, err.message);
      perCategory[cat] = [];
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Unified Mode (?all=1)
  // ───────────────────────────────────────────────────────────────
  if (allMode) {
    const summary = {};
    for (const [cat, items] of Object.entries(perCategory)) {
      summary[cat] = items.length;
    }

    const sorted = combined.sort((a, b) => {
      if (a.category === b.category) return a.title.localeCompare(b.title);
      return a.category.localeCompare(b.category);
    });

    const payload = {
      source: "TinmanApps CTA Engine",
      version: CTA_ENGINE_VERSION || "v9.0",
      generated: new Date().toISOString(),
      totalDeals: sorted.length,
      categories: Object.keys(summary).length,
      summary,
      deals: sorted,
    };

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(payload, null, 2));
    return;
  }

  // ───────────────────────────────────────────────────────────────
  // Default Mode (per-category active-only export)
  // ───────────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(
    JSON.stringify(
      {
        source: "TinmanApps CTA Engine",
        version: CTA_ENGINE_VERSION || "v9.0",
        generated: new Date().toISOString(),
        categories: perCategory,
      },
      null,
      2
    )
  );
}
