// /api/ctr-report.js
// 📊 Read-only viewer for TinmanApps CTR analytics
// Lets you inspect /data/ctr-insights.json securely

import fs from "fs";
import path from "path";

const TRACK_PATH = path.resolve("./data/ctr-insights.json");

export default async function handler(req, res) {
  try {
    const json = fs.readFileSync(TRACK_PATH, "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(json);
  } catch (err) {
    res
      .status(500)
      .json({ error: "CTR data not available yet", details: err.message });
  }
}
