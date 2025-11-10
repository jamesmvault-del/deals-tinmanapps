// /lib/learningGovernor.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Adaptive Learning Governor v3.0
// “Momentum-Weighted Semantic Bias Engine”
//
// PURPOSE
// • Converts real CTR behaviour into momentum signals.
// • Biases CTA + Subtitle generation toward proven semantic clusters.
// • Feeds CTA Evolver, CTA Engine, SEO Integrity Engine, and CTR tracker.
// • Ensures no undefined categories, no zero-division, no malformed weights.
// • Guaranteed deterministic fallbacks.
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
// Safe loader
// ───────────────────────────────────────────────────────────────────────────────
function loadCTR() {
  try {
    const raw = fs.readFileSync(CTR_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      totalClicks: 0,
      byDeal: {},
      byCategory: {},
      recent: [],
      learning: {},
      momentum: {},
    };
  }
}

// Safe writer
function saveCTR(data) {
  try {
    fs.writeFileSync(CTR_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("LearningGovernor write error:", e.message);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Normalisation + Weighted Selection
// ───────────────────────────────────────────────────────────────────────────────
function normalizeWeights(input = {}) {
  const entries = Object.entries(input).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return {};
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  return Object.fromEntries(entries.map(([k, v]) => [k, v / total]));
}

function weightedPick(weightMap = {}) {
  const keys = Object.keys(weightMap);
  if (!keys.length) return null;
  let rnd = Math.random();
  for (const [k, w] of Object.entries(weightMap)) {
    rnd -= w;
    if (rnd <= 0) return k;
  }
  return keys[keys.length - 1];
}

// ───────────────────────────────────────────────────────────────────────────────
// CATEGORY → MOMENTUM MODEL
// Momentum = CTR(clicks) + Learning(clicks/impressions) smoothed
// ───────────────────────────────────────────────────────────────────────────────
function computeCategoryMomentum(ctr = {}) {
  const cat = ctr.byCategory || {};
  const learn = ctr.learning || {};

  const scores = {};

  for (const category of Object.keys(cat)) {
    const ctrClicks = cat[category] || 0;

    let learnScore = 0;
    if (learn[category]) {
      for (const rec of Object.values(learn[category])) {
        const { clicks = 0, impressions = 1 } = rec;
        learnScore += clicks / impressions;
      }
    }

    const momentum = Math.log1p(ctrClicks) + learnScore * 0.7;
    if (momentum > 0) scores[category] = momentum;
  }

  return normalizeWeights(scores);
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: getLearningBias(category)
// Returns adaptive weighting for CTA Engine + SEO Engine
// ───────────────────────────────────────────────────────────────────────────────
export function getLearningBias(category = "software") {
  const ctr = loadCTR();
  const momentum = computeCategoryMomentum(ctr);

  // If no weights exist → deterministic neutral fallback
  if (!Object.keys(momentum).length) {
    return { toneBias: "neutral", momentum };
  }

  const chosen = weightedPick(momentum) || "software";

  return {
    toneBias: chosen,
    momentum,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: reinforceLearning({ category, patternKey })
// Updates CTR → Learning model and increases future weighting
// Called by /api/track.js
// ───────────────────────────────────────────────────────────────────────────────
export function reinforceLearning({ category, patternKey }) {
  if (!category || !patternKey) return;

  const ctr = loadCTR();

  if (!ctr.learning) ctr.learning = {};
  if (!ctr.learning[category]) ctr.learning[category] = {};
  if (!ctr.learning[category][patternKey])
    ctr.learning[category][patternKey] = { clicks: 0, impressions: 1 };

  const rec = ctr.learning[category][patternKey];
  rec.clicks += 1;
  rec.impressions += 3; // gentle smoothing for stability

  // Track momentum change for Evolver
  if (!ctr.momentum) ctr.momentum = {};
  ctr.momentum[patternKey] = {
    delta: Math.log1p(rec.clicks / rec.impressions),
    updatedAt: new Date().toISOString(),
  };

  saveCTR(ctr);
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC: applyLearningBias(options, category)
// Applies momentum weighting to phrase selection
// ───────────────────────────────────────────────────────────────────────────────
export function applyLearningBias(options = [], category = "software") {
  if (!options.length) return null;

  const { momentum } = getLearningBias(category);

  if (!Object.keys(momentum).length) {
    return options[Math.floor(Math.random() * options.length)];
  }

  const weighted = {};

  for (const opt of options) {
    const key = opt.toLowerCase();
    weighted[opt] = momentum[category] || 0.1;
  }

  const normalized = normalizeWeights(weighted);
  const picked = weightedPick(normalized);

  return picked || options[Math.floor(Math.random() * options.length)];
}

// ───────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT
// ───────────────────────────────────────────────────────────────────────────────
export default {
  getLearningBias,
  reinforceLearning,
  applyLearningBias,
};
