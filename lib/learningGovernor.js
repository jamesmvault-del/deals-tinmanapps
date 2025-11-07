// /lib/learningGovernor.js
// TinmanApps — Adaptive Learning Governor v1.0 “CTR Resonance Learner”
// ───────────────────────────────────────────────────────────────────────────────
// Purpose:
// • Continuously bias CTA generation toward high-performing patterns.
// • Uses rolling averages from /data/ctr-insights.json to weight verbs, objects, and tones.
// • Works seamlessly with ctaEngine.js v3.4+ and semanticCluster.js.
// • No external calls; fully self-contained adaptive logic.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");

// ---------- Load CTR Data ----------
function loadCTR() {
  try {
    const raw = fs.readFileSync(CTR_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, recent: [] };
  }
}

// ---------- CTR Weighting Utilities ----------
function normalizeWeights(obj = {}) {
  const entries = Object.entries(obj);
  if (!entries.length) return {};
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  return Object.fromEntries(entries.map(([k, v]) => [k, v / total]));
}

function weightedPick(weightMap = {}) {
  const rnd = Math.random();
  let sum = 0;
  for (const [k, w] of Object.entries(weightMap)) {
    sum += w;
    if (rnd <= sum) return k;
  }
  return Object.keys(weightMap)[0];
}

// ---------- Learning Bias Logic ----------
export function getLearningBias(category = "software") {
  const ctr = loadCTR();
  const catCTR = ctr.byCategory?.[category] || {};
  const norm = normalizeWeights(catCTR);
  const total = Object.keys(norm).length;

  // produce a probability-weighted tone bias
  return {
    toneBias: total > 2 ? weightedPick(norm) : "neutral",
    weightMap: norm,
  };
}

// ---------- Reinforcement Updater ----------
export function reinforceLearning({ category, patternKey }) {
  const ctr = loadCTR();
  if (!ctr.learning) ctr.learning = {};

  if (!ctr.learning[category]) ctr.learning[category] = {};
  if (!ctr.learning[category][patternKey])
    ctr.learning[category][patternKey] = { clicks: 0, impressions: 0 };

  // reinforce CTR ratio gradually
  const record = ctr.learning[category][patternKey];
  record.clicks += 1;
  record.impressions += 5; // small inflation keeps learning stable

  try {
    fs.writeFileSync(CTR_FILE, JSON.stringify(ctr, null, 2));
  } catch (e) {
    console.error("LearningGovernor write error:", e.message);
  }
}

// ---------- Bias-Aware Selection ----------
export function applyLearningBias(options = [], category = "software") {
  const { weightMap } = getLearningBias(category);
  if (!Object.keys(weightMap).length) return options[Math.floor(Math.random() * options.length)];

  const weightedOptions = {};
  for (const opt of options) {
    const key = opt.toLowerCase();
    weightedOptions[opt] = weightMap[key] || 1 / options.length;
  }

  return weightedPick(normalizeWeights(weightedOptions));
}

// ---------- Exports ----------
export default {
  getLearningBias,
  reinforceLearning,
  applyLearningBias,
};
