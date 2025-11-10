// /api/debug-learning.js
// TinmanApps — Learning Governor Insight v2.0 “Reinforcement Matrix + Tone Drift Analyzer”
// ───────────────────────────────────────────────────────────────────────────────
// Purpose:
// • Deep inspection of the adaptive reinforcement system
// • Shows per-category: tone drift, total reinforcements, pattern strengths,
//   CTR alignment, and learning density
// • Pure JSON output for debugging / system health checks
// • Fully compatible with learningGovernor.js v2.x + rankingEngine v2.x
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const LEARN_FILE = path.resolve("./data/learning-governor.json");
const CTR_FILE = path.resolve("./data/ctr-insights.json");

function loadJsonSafe(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  const learning = loadJsonSafe(LEARN_FILE, {});
  const ctr = loadJsonSafe(CTR_FILE, {
    totalClicks: 0,
    byCategory: {},
    byDeal: {},
    recent: [],
    learning: {},
  });

  const out = [];
  const now = new Date().toISOString();

  // --- Loop categories inside learning-governor.json ---
  for (const [category, patterns] of Object.entries(learning)) {
    const keys = Object.keys(patterns || {});
    const totalReinforce = keys.length;
    const clicks = ctr.byCategory?.[category] || 0;

    // Build pattern-level strength summary
    const patternSummary = keys.map((key) => {
      const rec = patterns[key] || {};
      const clicks = rec.clicks || 0;
      const impressions = rec.impressions || 0;
      const strength = clicks * 1 + impressions * 0.25;

      return {
        pattern: key,
        clicks,
        impressions,
        strength: Number(strength.toFixed(2)),
      };
    });

    // Sort by strongest patterns
    patternSummary.sort((a, b) => b.strength - a.strength);

    // Tone drift indicator
    const drift =
      patterns.toneBias ||
      patterns.tone ||
      (patterns._toneBias || "neutral");

    // CTR alignment: how many reinforced patterns match the highest CTR deals
    const topDeals = Object.entries(ctr.byDeal || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([slug]) => slug);

    let ctrAligned = 0;
    for (const p of patternSummary.slice(0, 20)) {
      if (topDeals.some((d) => d.includes(p.pattern))) ctrAligned++;
    }

    out.push({
      category,
      totalClicks: clicks,
      reinforcementCount: totalReinforce,
      ctrAlignment: ctrAligned,
      tone: drift,
      patterns: patternSummary.slice(0, 15), // top 15 strongest patterns
    });
  }

  // Sort categories by reinforcement strength (descending)
  out.sort((a, b) => b.reinforcementCount - a.reinforcementCount);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    analysedAt: now,
    totalClicks: ctr.totalClicks || 0,
    categories: out,
  });
}
