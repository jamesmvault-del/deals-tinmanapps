// /api/master-cron.js
// 🔁 TinmanApps Master Cron v3.1
// Full optimisation cycle with silent insight + CTA evolver integration

import { backgroundRefresh } from "../lib/proxyCache.js";
import { evolveCTAs } from "../lib/ctaEvolver.js";
import insightHandler from "./insight.js";

export default async function handler(req, res) {
  const force = req.query.force === "1";
  const startTime = Date.now();

  try {
    console.log("🔁 [Cron] Starting refresh cycle @", new Date().toISOString());

    // 1️⃣ Refresh AppSumo data
    await backgroundRefresh();
    console.log("✅ [Cron] Builder refresh complete");

    // 2️⃣ Run insight analysis silently (mock res)
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("✅ [Cron] Insight refresh complete");

    // 3️⃣ Run CTA evolution
    evolveCTAs();
    console.log("✅ [Cron] CTA evolution complete");

    // (optional) 4️⃣ Feed refresh placeholder
    console.log("📡 [Cron] Feed refresh pending integration...");

    const duration = Date.now() - startTime;
    console.log(`✅ [Cron] Full cycle complete in ${duration} ms`);

    res.json({
      message: "Cycle triggered in background.",
      duration,
      previousRun: new Date().toISOString(),
      steps: ["builder", "insight", "cta-evolver"]
    });
  } catch (err) {
    console.error("❌ [Cron] Error:", err);
    res
      .status(500)
      .json({ error: "Cron cycle failed", details: err.message });
  }
}
