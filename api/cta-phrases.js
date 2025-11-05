// /api/cta-phrases.js
// 📘 Read-only endpoint to inspect live CTA phrases
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const filePath = path.resolve("./data/cta-phrases.json");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "cta-phrases.json not found yet" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.setHeader("Content-Type", "application/json");
    res.json({
      source: "TinmanApps CTA Evolution System",
      fetchedAt: new Date().toISOString(),
      totalActive: data.active.length,
      totalHistory: data.history.length,
      sample: data.active.slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
