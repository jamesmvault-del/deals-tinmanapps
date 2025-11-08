// /api/version.js
// Diagnostic: confirms which CTA Engine is actually running live
export default function handler(req, res) {
  try {
    res.json({
      app: "TinmanApps Deal Engine",
      expected_cta_engine: "v3.7 Precision Diversity",
      timestamp: new Date().toISOString(),
      cacheBust: Math.random().toString(36).slice(2, 10),
      cwd: process.cwd(),
      env: process.env.NODE_ENV || "unknown",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
