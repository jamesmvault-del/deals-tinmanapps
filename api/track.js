// /api/track.js
// 📊 TinmanApps CTR Feedback Tracker v1.0
// Records click and engagement events for adaptive optimisation

import fs from "fs";
import path from "path";

const TRACK_PATH = path.resolve("./data/ctr-insights.json");

function loadCTRData() {
  try {
    return JSON.parse(fs.readFileSync(TRACK_PATH, "utf8"));
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, recent: [] };
  }
}

function saveCTRData(data) {
  fs.writeFileSync(TRACK_PATH, JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
  const { deal, cat } = req.query;

  if (!deal) {
    res.status(400).json({ error: "Missing deal slug" });
    return;
  }

  const data = loadCTRData();

  // 🔹 Update global counter
  data.totalClicks++;

  // 🔹 Per-deal tracking
  data.byDeal[deal] = (data.byDeal[deal] || 0) + 1;

  // 🔹 Per-category tracking
  if (cat) data.byCategory[cat] = (data.byCategory[cat] || 0) + 1;

  // 🔹 Log recent events (keep last 100)
  data.recent.unshift({
    deal,
    cat: cat || "unknown",
    at: new Date().toISOString()
  });
  if (data.recent.length > 100) data.recent.pop();

  saveCTRData(data);

  res.json({
    message: "CTR recorded",
    total: data.totalClicks,
    topDeal: Object.entries(data.byDeal)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
  });
}
