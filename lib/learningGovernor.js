// /lib/learningGovernor.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Adaptive Learning Governor v4.1
// “Unified Momentum Engine • CTA Bias • Category Ordering Influence • v4-tier Sync”
//
// PURPOSE
// • Convert real CTR behaviour into category + pattern momentum signals.
// • Bias CTA / subtitle / phrase generation toward PROVEN semantic directions.
// • Expose category-level weights for homepage/category ordering.
// • Feed CTA Evolver, CTA Engine, SEO Integrity, Ranking Engine, Insight Pulse.
//
// GUARANTEES
// • Fully Render-safe, zero deps, deterministic FS behaviour.
// • No undefined categories, no NaN weights, no negative values.
// • Fully backwards-compatible with v3.0 APIs.
// • New v4.1: exported GOVERNOR_VERSION for /api/version.js sync reporting.
//
// VERSION EXPORT (required by /api/version.js)
// ───────────────────────────────────────────────────────────────────────────────
export const GOVERNOR_VERSION = "v4.1 Unified Momentum Engine";

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
  const entries = Object.entries(weightMap);
  if (!entries.length) return null;

  let r = Math.random();
  for (const [key, weight] of entries) {
    r -= weight;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

// ───────────────────────────────────────────────────────────────────────────────
// Category Recency Model
// ───────────────────────────────────────────────────────────────────────────────
function computeCategoryRecency(recent = []) {
  const MAX = 200;
  const slice = Array.isArray(recent) ? recent.slice(0, MAX) : [];
  const out = {};

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
    const weight = (MAX - i) / MAX; // newer = stronger
    out[key] = (out[key] || 0) + weight;
  }

  const vals = Object.values(out);
  const max = Math.max(0, ...vals);
  if (!max) return {};

  const normalized = {};
  for (const [k, v] of Object.entries(out)) {
    normalized[k] = Math.min(1, v / max);
  }
  return normalized;
}

// ───────────────────────────────────────────────────────────────────────────────
// Category Momentum Model (v4.1)
// ───────────────────────────────────────────────────────────────────────────────
function computeCategoryMomentumMap(ctr) {
  const byCategory = ctr.byCategory || {};
  const learning = ctr.learning || {};
  const recency = computeCategoryRecency(ctr.recent || {});

  const cats = new Set([
    ...Object.keys(byCategory),
    ...Object.keys(learning),
    ...Object.keys(recency),
  ]);

  const scores = {};

  for (const cat of cats) {
    const k = String(cat).toLowerCase();

    const rawClicks = byCategory[k] || 0;
    const clicks =
      typeof rawClicks === "number"
        ? rawClicks
        : Number(rawClicks.clicks || 0) || 0;

    const ctrScore = Math.log1p(Math.max(0, clicks));
    const recScore = recency[k] || 0;

    let learnScore = 0;
    const learnBucket = learning[k] || {};
    for (const rec of Object.values(learnBucket)) {
      const clicksL = Number(rec.clicks || 0);
      const imps = Math.max(1, Number(rec.impressions || 1));
      learnScore += clicksL / imps;
    }

    const combined =
      ctrScore * 0.7 +
      recScore * 1.0 +
      learnScore * 0.9;

    if (combined > 0 && Number.isFinite(combined)) {
      scores[k] = combined;
    }
  }

  return normalizeWeights(scores);
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: getLearningBias(category)
// ───────────────────────────────────────────────────────────────────────────────
export function getLearningBias(category = "software") {
  const ctr = loadCTR();
  const momentum = computeCategoryMomentumMap(ctr);

  ctr.categoryMomentum = momentum; // persist global map
  saveCTR(ctr);

  const keys = Object.keys(momentum);
  if (!keys.length) {
    return {
      toneBias: "software",
      momentum: {},
      weightForCategory: 0,
    };
  }

  let bestCat = "software";
  let bestScore = -Infinity;

  for (const [cat, w] of Object.entries(momentum)) {
    if (w > bestScore) {
      bestScore = w;
      bestCat = cat;
    }
  }

  const reqKey = String(category || "software").toLowerCase();

  return {
    toneBias: bestCat,
    momentum,
    weightForCategory: momentum[reqKey] || 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: reinforceLearning
// ───────────────────────────────────────────────────────────────────────────────
export function reinforceLearning({ category, patternKey }) {
  if (!category || !patternKey) return;

  const ctr = loadCTR();
  const catKey = String(category).toLowerCase();
  const key = String(patternKey);

  if (!ctr.learning[catKey]) ctr.learning[catKey] = {};
  if (!ctr.learning[catKey][key]) {
    ctr.learning[catKey][key] = { clicks: 0, impressions: 1 };
  }

  const rec = ctr.learning[catKey][key];
  rec.clicks += 1;
  rec.impressions += 3;

  if (!ctr.momentum) ctr.momentum = {};
  ctr.momentum[key] = {
    delta: Math.log1p(rec.clicks / Math.max(1, rec.impressions)),
    updatedAt: new Date().toISOString(),
  };

  ctr.categoryMomentum = computeCategoryMomentumMap(ctr);
  saveCTR(ctr);
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: applyLearningBias
// ───────────────────────────────────────────────────────────────────────────────
export function applyLearningBias(options = [], category = "software") {
  if (!Array.isArray(options) || !options.length) return null;

  const { weightForCategory } = getLearningBias(category);

  if (!weightForCategory || weightForCategory <= 0) {
    return options[Math.floor(Math.random() * options.length)];
  }

  const n = options.length;
  const weights = {};
  const base = 1 / n;

  const strength = 0.2 + weightForCategory * 0.6;

  for (let i = 0; i < n; i++) {
    const pos = i / Math.max(1, n - 1);
    const bias = 1 - pos;
    weights[options[i]] = base * (1 + bias * strength);
  }

  const normalized = normalizeWeights(weights);
  return weightedPick(normalized) || options[Math.floor(Math.random() * options.length)];
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: getCategoryOrderingWeights
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
  GOVERNOR_VERSION,
  getLearningBias,
  reinforceLearning,
  applyLearningBias,
  getCategoryOrderingWeights,
};
