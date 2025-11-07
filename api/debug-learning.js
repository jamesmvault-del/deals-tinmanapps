// /api/debug-learning.js
// 🧩 TinmanApps Learning Governor Insight Endpoint v1.0
// Read-only view into adaptive CTR + tone weighting

import fs from "fs";
import path from "path";

const LEARN_FILE = path.resolve("./data/learning-governor.json");
const CTR_FILE = path.resolve("./data/ctr-insights.json");

function loadJsonSafe(p, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  const learning = loadJsonSafe(LEARN_FILE, {});
  const ctr = loadJsonSafe(CTR_FILE, { totalClicks: 0, byCategory: {} });

  const summary = Object.entries(learning).map(([category, data]) => {
    const clicks = ctr.byCategory?.[category] || 0;
    const biasKeys = Object.keys(data.biases || {});
    const tone = data.toneBias || "neutral";
    const topBias =
      biasKeys.length > 0
        ? biasKeys
            .sort((a, b) => (data.biases[b] || 0) - (data.biases[a] || 0))
            .slice(0, 3)
        : [];

    return {
      category,
      tone,
      clicks,
      topBias,
    };
  });

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    timestamp: new Date().toISOString(),
    totalClicks: ctr.totalClicks || 0,
    summary: summary.sort((a, b) => b.clicks - a.clicks),
  });
}
