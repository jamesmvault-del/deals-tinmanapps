// /lib/learningGovernor.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Adaptive Learning Governor v4.0
// “Unified Momentum Engine • CTA Bias • Category Ordering Influence”
//
// PURPOSE
// • Convert real CTR behaviour into category + pattern momentum signals.
// • Bias CTA / subtitle / phrase generation toward PROVEN semantic directions.
// • Expose category-level weights for homepage/category ordering.
// • Feed CTA Evolver, CTA Engine, SEO Integrity Engine, Ranking Engine, Insight.
//
// GUARANTEES
// • No undefined categories, no NaN, no negative weights.
// • Deterministic normalisation, safe fallbacks, Render-safe FS writes.
// • Backwards compatible with v3.0: same exported functions,
//   extended with richer momentum semantics.
//
// DATA FILE
//   /data/ctr-insights.json
//   {
//     totalClicks: number,
//     byDeal: { [slug]: number | { clicks:number } },
//     byCategory: { [cat]: number },
//     recent: [{ deal, category, at, ... }],
//     learning: { [cat]: { [patternKey]: { clicks, impressions } } },
//     momentum: { [patternKey]: { delta, updatedAt } },
//     categoryMomentum?: { [cat]: number }      // ← v4.0 (normalized 0..1)
//   }
//
// PUBLIC API
//   getLearningBias(category?)
//   reinforceLearning({ category, patternKey })
//   applyLearningBias(options, category?)
//   getCategoryOrderingWeights()
//
// Fully Render-Safe + GitHub-Safe
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");

// ───────────────────────────────────────────────────────────────────────────────
// Safe loader / writer
// ───────────────────────────────────────────────────────────────────────────────
function loadCTR() {
  try {
    const raw = fs.readFileSync(CTR_FILE, "utf8");
    const json = JSON.parse(raw);

    // Backwards-safe shape
    return {
      totalClicks: Number(json.totalClicks || 0),
      byDeal: json.byDeal || {},
      byCategory: json.byCategory || {},
      recent: Array.isArray(json.recent) ? json.recent : [],
      learning: json.learning || {},
      momentum: json.momentum || {},
      categoryMomentum: json.categoryMomentum || {},
    };
  } catch {
    return {
      totalClicks: 0,
      byDeal: {},
      byCategory: {},
      recent: [],
      learning: {},
      momentum: {},
      categoryMomentum: {},
    };
  }
}

function saveCTR(data) {
  try {
    fs.writeFileSync(CTR_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("LearningGovernor write error:", e.message);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Normalisation + Weighted Selection
// ───────────────────────────────────────────────────────────────────────────────
function normalizeWeights(input = {}) {
  const entries = Object.entries(input).filter(
    ([, v]) => typeof v === "number" && v > 0
  );
  if (!entries.length) return {};
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (!total || !Number.isFinite(total)) return {};
  return Object.fromEntries(entries.map(([k, v]) => [k, v / total]));
}

function weightedPick(weightMap = {}) {
  const keys = Object.keys(weightMap);
  if (!keys.length) return null;
  let r = Math.random();
  for (const [k, w] of Object.entries(weightMap)) {
    r -= w;
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

// ───────────────────────────────────────────────────────────────────────────────
// CATEGORY RECENCY MODEL
// Uses recent CTR events to produce a per-category recency boost.
// New clicks in a category → higher short-term boost.
// ───────────────────────────────────────────────────────────────────────────────
function computeCategoryRecency(recent = []) {
  const maxEvents = 200;
  const recency = {};
  const slice = Array.isArray(recent) ? recent.slice(0, maxEvents) : [];

  for (let i = 0; i < slice.length; i++) {
    const evt = slice[i] || {};
    const cat =
      evt.category ||
      evt.cat ||
      evt.categoryKey ||
      evt.catKey ||
      null;
    if (!cat) continue;
    const key = String(cat).toLowerCase();
    // More recent → higher weight. Index 0 = newest.
    const weight = (maxEvents - i) / maxEvents; // 1.0 .. ~0
    recency[key] = (recency[key] || 0) + weight;
  }

  // Soft normalise to 0..1 range
  let max = 0;
  for (const v of Object.values(recency)) {
    if (v > max) max = v;
  }
  if (!max) return {};
  const out = {};
  for (const [k, v] of Object.entries(recency)) {
    out[k] = Math.min(1, v / max);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// CATEGORY → MOMENTUM MODEL (v4.0)
// Momentum per category uses three components:
//   1) CTR volume:     log1p(clicks)
//   2) Recency boost:  based on recent[] category events
//   3) Learning score: patternKey click-through bias
//
// The result is a NORMALIZED weight-map { cat: 0..1 } suitable for:
//   • CTA / subtitle tone-bias
//   • Category ordering (home, /categories, etc.)
//   • CTA Evolver & Insight for advanced weighting.
// ───────────────────────────────────────────────────────────────────────────────
function computeCategoryMomentumMap(ctr) {
  const byCategory = ctr.byCategory || {};
  const learning = ctr.learning || {};
  const recency = computeCategoryRecency(ctr.recent || []);

  const cats = new Set([
    ...Object.keys(byCategory),
    ...Object.keys(learning),
    ...Object.keys(recency),
  ]);

  const scores = {};

  for (const cat of cats) {
    const key = String(cat || "software").toLowerCase();

    // 1) CTR volume (log1p for diminishing returns)
    const rawClicks = byCategory[key] || 0;
    const clicks =
      typeof rawClicks === "number"
        ? rawClicks
        : Number(rawClicks.clicks || 0) || 0;
    const ctrScore = Math.log1p(Math.max(0, clicks)); // 0..∞

    // 2) Recency (0..1)
    const recScore = recency[key] || 0;

    // 3) Learning score (aggregated pattern performance)
    let learnScore = 0;
    const learnBucket = learning[key] || {};
    for (const rec of Object.values(learnBucket)) {
      const clicksL = Number(rec.clicks || 0);
      const imps = Math.max(1, Number(rec.impressions || 1));
      const ratio = clicksL / imps; // 0..1+
      if (ratio > 0) learnScore += ratio;
    }

    // Combine with tuned weights (heuristic, but stable):
    // - ctrScore dominates long-term
    // - recScore gives short-term momentum
    // - learnScore focuses on specific high-performing patterns
    const combined =
      ctrScore * 0.7 + // long-memory strength
      recScore * 1.0 + // short-term spark
      learnScore * 0.9; // semantic/pattern refinement

    if (combined > 0 && Number.isFinite(combined)) {
      scores[key] = combined;
    }
  }

  return normalizeWeights(scores);
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: getLearningBias(category)
// Returns adaptive weighting for CTA Engine / SEO / Rankers.
//
// shape:
//   {
//     toneBias: "ai" | "marketing" | ... (chosen hottest cat, else "software")
//     momentum: { [cat]: 0..1 },          // normalized map
//     weightForCategory: 0..1,           // how "hot" the requested cat is
//   }
// ───────────────────────────────────────────────────────────────────────────────
export function getLearningBias(category = "software") {
  const ctr = loadCTR();
  const momentum = computeCategoryMomentumMap(ctr);

  // Persist category momentum map for other engines (Insight, home, etc.)
  ctr.categoryMomentum = momentum;
  saveCTR(ctr);

  const keys = Object.keys(momentum);
  // If nothing learned yet → neutral fallback
  if (!keys.length) {
    return {
      toneBias: "software",
      momentum: {},
      weightForCategory: 0,
    };
  }

  // Primary tone bias = highest-momentum category
  let bestCat = "software";
  let bestScore = -Infinity;
  for (const [cat, w] of Object.entries(momentum)) {
    if (w > bestScore) {
      bestScore = w;
      bestCat = cat;
    }
  }

  const requestedKey = String(category || "software").toLowerCase();
  const weightForCategory = momentum[requestedKey] || 0;

  return {
    toneBias: bestCat,
    momentum,
    weightForCategory,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: reinforceLearning({ category, patternKey })
// Called from /api/track.js (or equivalent) on click events.
//
// • Increments per-pattern learning for a category.
// • Updates per-pattern momentum delta for CTA Evolver.
// • NEXT RUN: getLearningBias() + evolveCTAs() will see these changes.
// ───────────────────────────────────────────────────────────────────────────────
export function reinforceLearning({ category, patternKey }) {
  if (!category || !patternKey) return;

  const ctr = loadCTR();
  const catKey = String(category).toLowerCase();
  const key = String(patternKey);

  if (!ctr.learning) ctr.learning = {};
  if (!ctr.learning[catKey]) ctr.learning[catKey] = {};
  if (!ctr.learning[catKey][key]) {
    ctr.learning[catKey][key] = { clicks: 0, impressions: 1 };
  }

  const rec = ctr.learning[catKey][key];
  rec.clicks += 1;
  rec.impressions += 3; // gentle smoothing for stability

  // Track pattern-level momentum (used by CTA Evolver v4.x)
  if (!ctr.momentum) ctr.momentum = {};
  ctr.momentum[key] = {
    delta: Math.log1p(rec.clicks / Math.max(1, rec.impressions)),
    updatedAt: new Date().toISOString(),
  };

  // Optionally update categoryMomentum immediately to keep things fresh
  ctr.categoryMomentum = computeCategoryMomentumMap(ctr);

  saveCTR(ctr);
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: applyLearningBias(options, category)
// Applies category momentum weighting to phrase selection.
//
// Intended usage:
//   - CTA Engine: bias verb/adjective pools per category
//   - Subtitle builder: bias tone phrases
//
// Behaviour:
//   • If no momentum yet → uniform random.
//   • If category is “hot” → slightly favour earlier options (assumed best).
//   • If category is “cold” → more exploratory (flatter distribution).
// ───────────────────────────────────────────────────────────────────────────────
export function applyLearningBias(options = [], category = "software") {
  if (!Array.isArray(options) || !options.length) return null;
  const { weightForCategory } = getLearningBias(category);

  // No signal yet → pure random
  if (!weightForCategory || weightForCategory <= 0) {
    return options[Math.floor(Math.random() * options.length)];
  }

  // Build a simple biased distribution over index positions.
  // Higher momentum → stronger preference for early options.
  const n = options.length;
  const weights = {};
  const base = 1 / n;

  // Strength factor 0..0.8 (how much we lean toward low indices)
  const strength = 0.2 + weightForCategory * 0.6;

  for (let i = 0; i < n; i++) {
    const position = i / Math.max(1, n - 1); // 0..1
    const bias = 1 - position; // early indices get higher bias
    const w = base * (1 + bias * strength);
    weights[options[i]] = w;
  }

  const normalized = normalizeWeights(weights);
  const picked = weightedPick(normalized);

  return picked || options[Math.floor(Math.random() * options.length)];
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: getCategoryOrderingWeights()
// Direct helper for /api/home.js, /api/categories.js, Insight, etc.
//
// Returns a stable, normalized map for ordering categories globally:
//   { ai: 0.24, marketing: 0.18, ... }
//
// If no data yet, returns an empty object (caller should fallback to static
// ordering).
// ───────────────────────────────────────────────────────────────────────────────
export function getCategoryOrderingWeights() {
  const ctr = loadCTR();
  const momentum =
    Object.keys(ctr.categoryMomentum || {}).length
      ? ctr.categoryMomentum
      : computeCategoryMomentumMap(ctr);

  return normalizeWeights(momentum);
}

// ───────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT
// ───────────────────────────────────────────────────────────────────────────────
export default {
  getLearningBias,
  reinforceLearning,
  applyLearningBias,
  getCategoryOrderingWeights,
};
