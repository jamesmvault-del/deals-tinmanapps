// /api/cta-dump.js
// TinmanApps — CTA & Subtitle Exporter v4.1
// “Active-Only • Deterministic • Context-Aware • Diagnostic-Ready”
// ───────────────────────────────────────────────────────────────────────────────
// Alignment for v10.1 CTA Engine (Context-Aware):
// • Reflects CTA Engine v10.1 dynamically
// • Active-only dataset (archived excluded)
// • Deterministic ordering (category → title)
// • Category-level diagnostics (duplication + entropy metrics)
// • Unified ?all=1 → flattened dataset + global summary + diagnostics
// • Context-safe text sanitisation for export (no HTML fragments)
// • Render-safe (FS-only), no side-effects
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
function sanitize(t = "") {
  return String(t || "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function computeDiagnostics(items = []) {
  if (!items.length) return { total: 0, dupCTAs: 0, dupSubs: 0, entropyCTA: 0, entropySub: 0 };
  const total = items.length;
  const uniqueCTAs = new Set(items.map((i) => sanitize(i.cta))).size;
  const uniqueSubs = new Set(items.map((i) => sanitize(i.subtitle))).size;
  const dupCTAs = total - uniqueCTAs;
  const dupSubs = total - uniqueSubs;
  const entropyCTA = +(uniqueCTAs / total).toFixed(2);
  const entropySub = +(uniqueSubs / total).toFixed(2);
  return { total, dupCTAs, dupSubs, entropyCTA, entropySub };
}

// ───────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));

  const allMode = req.query.all === "1" || req.query.all === "true";

  const perCategory = {};
  const combined = [];
  const diagnostics = {};

  // ───────────────────────────────────────────────────────────────
  // Load ACTIVE ONLY per category
  // ───────────────────────────────────────────────────────────────
  for (const file of files) {
    const cat = file.replace("appsumo-", "").replace(".json", "");
    try {
      const full = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
      const active = full
        .filter((d) => !d.archived)
        .map((d) => ({
          category: cat,
          title: sanitize(d.title?.trim?.() || ""),
          cta: sanitize(d.seo?.cta?.trim?.() || ""),
          subtitle: sanitize(d.seo?.subtitle?.trim?.() || ""),
        }))
        .sort((a, b) => a.title.localeCompare(b.title));

      perCategory[cat] = active;
      combined.push(...active);
      diagnostics[cat] = computeDiagnostics(active);
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${file}:`, err.message);
      perCategory[cat] = [];
      diagnostics[cat] = { total: 0, dupCTAs: 0, dupSubs: 0, entropyCTA: 0, entropySub: 0 };
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Unified Mode (?all=1) → flattened global export
  // ───────────────────────────────────────────────────────────────
  if (allMode) {
    const summary = {};
    for (const [cat, items] of Object.entries(perCategory)) summary[cat] = items.length;

    const sorted = combined.sort((a, b) => {
      if (a.category === b.category) return a.title.localeCompare(b.title);
      return a.category.localeCompare(b.category);
    });

    const globalDiag = computeDiagnostics(sorted);

    const payload = {
      source: "TinmanApps CTA Engine",
      version: CTA_ENGINE_VERSION || "v10.1",
      generated: new Date().toISOString(),
      totalDeals: sorted.length,
      categories: Object.keys(summary).length,
      summary,
      diagnostics: { global: globalDiag, perCategory: diagnostics },
      deals: sorted,
    };

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(payload, null, 2));
    return;
  }

  // ───────────────────────────────────────────────────────────────
  // Default Mode (per-category structured export)
  // ───────────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(
    JSON.stringify(
      {
        source: "TinmanApps CTA Engine",
        version: CTA_ENGINE_VERSION || "v10.1",
        generated: new Date().toISOString(),
        categories: perCategory,
        diagnostics,
      },
      null,
      2
    )
  );
}
