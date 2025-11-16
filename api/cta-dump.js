// /api/cta-dump.js
// TinmanApps — CTA & Subtitle Exporter v7.2
// “Momentum-Aware Entropy Grid — Learning-Ready Diagnostics”
// ───────────────────────────────────────────────────────────────────────────────
// Alignment for:
//   • CTA Engine v11.2+
//   • CTA Evolver v4.2+
//   • Learning Governor v4.x
//   • Insight Pulse v6.5 “Opportunity Brain”
//
// Guarantees:
// • ACTIVE-ONLY dataset (archived excluded)
// • Deterministic ordering (category → title)
// • Category-level diagnostics:
//     - Duplication counts + rates (CTA + subtitle)
//     - Shannon entropy (CTA + subtitle strings)
//     - Token-level entropy (CTA + subtitle tokens)
//     - Length stats + variance (CTA + subtitle)
//     - Duplicate-token rate (“work work”, “boost boost”)
//     - Semantic cluster distribution (via semanticCluster)
// • Global diagnostics:
//     - True global stats (all deals combined)
//     - Category-weighted diagnostics (by deal share per category)
//     - Top duplicated CTA / subtitle phrases (global)
// • Momentum-aware overlay (if /data/insight-latest.json exists):
//     - Per-category momentum + opportunityScore + entropySignal
//     - Global momentum stats (average momentum & opportunityScore)
// • Unified ?all=1 mode:
//     - Flat array export with global + per-category diagnostics
// • Default mode:
//     - Per-category export + per-category diagnostics only
//
// Render-safe: FS-only, read-only, zero mutation.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";
import { detectCluster } from "../lib/semanticCluster.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const INSIGHT_PATH = path.join(DATA_DIR, "insight-latest.json");

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

function tokenize(t = "") {
  return String(t || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length > 1);
}

function shannonEntropy(values = []) {
  if (!values.length) return 0;
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const total = values.length || 1;
  let H = 0;
  for (const k in counts) {
    const p = counts[k] / total;
    H += -p * Math.log2(p || 1);
  }
  return Number.isFinite(H) ? +H.toFixed(2) : 0;
}

function tokenEntropy(list = []) {
  const tokens = [];
  for (const s of list) tokens.push(...tokenize(s));
  return shannonEntropy(tokens);
}

function lengthStats(list = []) {
  if (!list.length) {
    return {
      avg: 0,
      min: 0,
      max: 0,
      variance: 0,
    };
  }
  const lens = list.map((s) => String(s || "").length);
  const total = lens.length;
  const sum = lens.reduce((a, b) => a + b, 0);
  const avg = sum / total;
  let vSum = 0;
  for (const L of lens) vSum += Math.pow(L - avg, 2);
  const variance = vSum / total;

  return {
    avg: +avg.toFixed(1),
    min: Math.min(...lens),
    max: Math.max(...lens),
    variance: +variance.toFixed(1),
  };
}

function dupWordRate(list = []) {
  if (!list.length) return 0;
  const re = /\b(\w+)\s+\1\b/i;
  let bad = 0;
  for (const s of list) {
    if (re.test(String(s || ""))) bad++;
  }
  return +((bad / list.length) || 0).toFixed(2);
}

function semanticClusterDistribution(items = []) {
  const counts = {};
  for (const it of items) {
    const title = it.title || "";
    const cat = detectCluster ? detectCluster(title) : "software";
    const key = cat || "software";
    counts[key] = (counts[key] || 0) + 1;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const distribution = {};
  for (const [k, v] of Object.entries(counts)) {
    distribution[k] = +(v / total).toFixed(3);
  }

  const entropy = shannonEntropy(
    Object.entries(counts).map(([k, v]) => `${k}:${v}`)
  );

  let dominantCluster = null;
  let dominantCount = -1;
  for (const [k, v] of Object.entries(counts)) {
    if (v > dominantCount) {
      dominantCount = v;
      dominantCluster = k;
    }
  }

  return {
    counts,
    distribution,
    entropy,
    dominantCluster,
  };
}

function loadJsonSafe(p, fallback = null) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function topDuplicates(list = [], limit = 10) {
  const counts = {};
  for (const s of list) {
    const t = sanitize(s);
    if (!t) continue;
    counts[t] = (counts[t] || 0) + 1;
  }
  const rows = Object.entries(counts)
    .filter(([_, c]) => c > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
  return rows;
}

// ───────────────────────────────────────────────────────────────
// Diagnostics (category + global)
// ───────────────────────────────────────────────────────────────
function computeDiagnostics(items = [], includeTopLocal = false) {
  if (!items.length) {
    return {
      total: 0,
      dupCTAs: 0,
      dupSubs: 0,
      dupRateCTA: 0,
      dupRateSub: 0,
      entropyCTA: 0,
      entropySub: 0,
      advanced: {
        tokenEntropyCTA: 0,
        tokenEntropySub: 0,
        lengthCTA: { avg: 0, min: 0, max: 0, variance: 0 },
        lengthSub: { avg: 0, min: 0, max: 0, variance: 0 },
        dupWordRateCTA: 0,
        dupWordRateSub: 0,
        semanticClusters: {
          counts: {},
          distribution: {},
          entropy: 0,
          dominantCluster: null,
        },
        topDupCTAs: [],
        topDupSubs: [],
      },
    };
  }

  const total = items.length;
  const ctas = items.map((i) => sanitize(i.cta));
  const subs = items.map((i) => sanitize(i.subtitle));

  const uniqueCTAs = new Set(ctas).size;
  const uniqueSubs = new Set(subs).size;

  const dupCTAs = total - uniqueCTAs;
  const dupSubs = total - uniqueSubs;
  const dupRateCTA = +((dupCTAs / total) || 0).toFixed(2);
  const dupRateSub = +((dupSubs / total) || 0).toFixed(2);

  const entropyCTA = shannonEntropy(ctas);
  const entropySub = shannonEntropy(subs);

  const topDupCTAs = includeTopLocal ? topDuplicates(ctas, 5) : [];
  const topDupSubs = includeTopLocal ? topDuplicates(subs, 5) : [];

  const advanced = {
    tokenEntropyCTA: tokenEntropy(ctas),
    tokenEntropySub: tokenEntropy(subs),
    lengthCTA: lengthStats(ctas),
    lengthSub: lengthStats(subs),
    dupWordRateCTA: dupWordRate(ctas),
    dupWordRateSub: dupWordRate(subs),
    semanticClusters: semanticClusterDistribution(items),
    topDupCTAs,
    topDupSubs,
  };

  return {
    total,
    dupCTAs,
    dupSubs,
    dupRateCTA,
    dupRateSub,
    entropyCTA,
    entropySub,
    advanced,
  };
}

// Build category-weighted diagnostics from per-category stats
function buildWeightedDiagnostics(perCategoryDiagnostics = {}, summary = {}) {
  const totalDeals =
    Object.values(summary).reduce((a, b) => a + b, 0) || 1;

  let entropyCTA = 0;
  let entropySub = 0;
  let tokenEntropyCTA = 0;
  let tokenEntropySub = 0;
  let dupRateCTA = 0;
  let dupRateSub = 0;
  let dupWordRateCTA = 0;
  let dupWordRateSub = 0;

  for (const [cat, diag] of Object.entries(perCategoryDiagnostics)) {
    const weight = (summary[cat] || 0) / totalDeals;
    if (!weight) continue;

    entropyCTA += (diag.entropyCTA || 0) * weight;
    entropySub += (diag.entropySub || 0) * weight;
    tokenEntropyCTA += (diag.advanced?.tokenEntropyCTA || 0) * weight;
    tokenEntropySub += (diag.advanced?.tokenEntropySub || 0) * weight;
    dupRateCTA += (diag.dupRateCTA || 0) * weight;
    dupRateSub += (diag.dupRateSub || 0) * weight;
    dupWordRateCTA += (diag.advanced?.dupWordRateCTA || 0) * weight;
    dupWordRateSub += (diag.advanced?.dupWordRateSub || 0) * weight;
  }

  return {
    entropyCTA: +entropyCTA.toFixed(2),
    entropySub: +entropySub.toFixed(2),
    tokenEntropyCTA: +tokenEntropyCTA.toFixed(2),
    tokenEntropySub: +tokenEntropySub.toFixed(2),
    dupRateCTA: +dupRateCTA.toFixed(2),
    dupRateSub: +dupRateSub.toFixed(2),
    dupWordRateCTA: +dupWordRateCTA.toFixed(2),
    dupWordRateSub: +dupWordRateSub.toFixed(2),
  };
}

// Momentum overlay using Insight Pulse v6.5 snapshot (if present)
function buildMomentumOverlay(summary = {}) {
  const snapshot = loadJsonSafe(INSIGHT_PATH, null);
  const totalDeals =
    Object.values(summary).reduce((a, b) => a + b, 0) || 1;

  const perCategory = {};
  const momentumVals = [];
  const oppVals = [];

  for (const [cat, count] of Object.entries(summary)) {
    const weight = +(count / totalDeals).toFixed(3);
    const src = snapshot?.categories?.[cat] || null;

    const momentum =
      src && typeof src.momentum === "number" ? src.momentum : null;
    const opportunityScore =
      src && src.opportunity && typeof src.opportunity.score === "number"
        ? src.opportunity.score
        : null;
    const entropySignal =
      src && src.opportunity && typeof src.opportunity.entropySignal === "number"
        ? src.opportunity.entropySignal
        : null;

    if (momentum !== null) momentumVals.push(momentum);
    if (opportunityScore !== null) oppVals.push(opportunityScore);

    perCategory[cat] = {
      weight,
      momentum,
      opportunityScore,
      entropySignal,
    };
  }

  const avgMomentum =
    momentumVals.length
      ? +(
          momentumVals.reduce((a, b) => a + b, 0) / momentumVals.length
        ).toFixed(3)
      : null;

  const avgOpportunityScore =
    oppVals.length
      ? +(
          oppVals.reduce((a, b) => a + b, 0) / oppVals.length
        ).toFixed(1)
      : null;

  return {
    available: !!snapshot,
    perCategory,
    stats: {
      avgMomentum,
      avgOpportunityScore,
    },
  };
}

// ───────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  let files = [];
  try {
    files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));
  } catch {
    files = [];
  }

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
      const raw = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, file), "utf8")
      );
      const active = raw
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
      diagnostics[cat] = computeDiagnostics(active, false);
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${file}:`, err.message);
      perCategory[cat] = [];
      diagnostics[cat] = computeDiagnostics([], false);
    }
  }

  const summary = {};
  for (const [cat, items] of Object.entries(perCategory)) {
    summary[cat] = items.length;
  }

  // Momentum overlay via Insight Pulse (if available)
  const momentumOverlay = buildMomentumOverlay(summary);

  // ───────────────────────────────────────────────────────────────
  // Unified Mode (?all=1) → flattened global export
  // ───────────────────────────────────────────────────────────────
  if (allMode) {
    const sorted = combined.sort((a, b) => {
      if (a.category === b.category) return a.title.localeCompare(b.title);
      return a.category.localeCompare(b.category);
    });

    // True global diagnostics (all deals)
    const globalDiag = computeDiagnostics(sorted, true);

    // Category-weighted diagnostics
    const weightedDiag = buildWeightedDiagnostics(diagnostics, summary);

    // Global top duplicates (phrases)
    const globalTopDupCTAs = globalDiag.advanced.topDupCTAs;
    const globalTopDupSubs = globalDiag.advanced.topDupSubs;

    const payload = {
      source: "TinmanApps CTA Engine — Diagnostic Export",
      version: CTA_ENGINE_VERSION || "v11.2.x",
      mode: "learning-aware-diagnostic",
      generated: new Date().toISOString(),
      totalDeals: sorted.length,
      categories: Object.keys(summary).length,
      summary,
      diagnostics: {
        global: {
          ...globalDiag,
          advanced: {
            ...globalDiag.advanced,
            topDupCTAs: globalTopDupCTAs,
            topDupSubs: globalTopDupSubs,
          },
        },
        globalWeighted: weightedDiag,
        perCategory: diagnostics,
        momentum: momentumOverlay,
      },
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
        source: "TinmanApps CTA Engine — Diagnostic Export",
        version: CTA_ENGINE_VERSION || "v11.2.x",
        mode: "learning-aware-diagnostic",
        generated: new Date().toISOString(),
        categories: perCategory,
        diagnostics: {
          perCategory: diagnostics,
          momentum: momentumOverlay,
        },
      },
      null,
      2
    )
  );
}
