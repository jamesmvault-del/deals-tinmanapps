// /api/track.js
// 📊 TinmanApps CTR Feedback Tracker v2.0
// Logs engagement and redirects instantly to referral URL

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
  const { deal, cat, redirect } = req.query;

  if (!deal) {
    res.status(400).json({ error: "Missing deal slug" });
    return;
  }

  const data = loadCTRData();
  data.totalClicks++;
  data.byDeal[deal] = (data.byDeal[deal] || 0) + 1;
  if (cat) data.byCategory[cat] = (data.byCategory[cat] || 0) + 1;

  data.recent.unshift({
    deal,
    cat: cat || "unknown",
    at: new Date().toISOString()
  });
  if (data.recent.length > 100) data.recent.pop();

  saveCTRData(data);

  // ✅ If redirect param exists, send user there immediately
  if (redirect) {
    const target = decodeURIComponent(redirect);
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  // Fallback JSON for test mode
  res.json({
    message: "CTR recorded",
    total: data.totalClicks,
    topDeal: Object.entries(data.byDeal)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
  });
}
