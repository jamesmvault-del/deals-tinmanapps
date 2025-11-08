// /api/master-cron.js
// 🔁 TinmanApps Master Cron v3.2 “Feed Guardian”
// Full optimisation cycle with silent insight + CTA evolver + feed normalization

import fs from "fs";
import path from "path";
import { backgroundRefresh } from "../lib/proxyCache.js";
import { evolveCTAs } from "../lib/ctaEvolver.js";
import { enrichDeals } from "../lib/ctaEngine.js";
import insightHandler from "./insight.js";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

export default async function handler(req, res) {
  const force = req.query.force === "1";
  const startTime = Date.now();

  try {
    console.log("🔁 [Cron] Starting refresh cycle @", new Date().toISOString());

    // 1️⃣ Refresh AppSumo data
    await backgroundRefresh();
    console.log("✅ [Cron] Builder refresh complete");

    // 2️⃣ Normalize feed titles (repair missing titles)
    if (fs.existsSync(FEED_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
      const normalized = raw.map((deal) => {
        let title = deal.title || deal.name || deal.slug || "Untitled";
        if (!title || title.length < 3) title = deal.slug?.replace(/-/g, " ") || "Untitled";
        title = title
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .replace(/\s+/g, " ")
          .trim();
        return { ...deal, title };
      });

      // 2b️⃣ De-duplicate by slug or title
      const deduped = normalized.filter(
        (v, i, a) =>
          a.findIndex(
            (x) =>
              x.slug === v.slug ||
              x.title.toLowerCase() === v.title.toLowerCase()
          ) === i
      );

      // 2c️⃣ Save repaired feed
      fs.writeFileSync(
        FEED_PATH,
        JSON.stringify(deduped, null, 2),
        "utf8"
      );
      console.log(`✅ [Cron] Feed normalized (${deduped.length} entries)`);

      // 3️⃣ Enrich feed with CTAs + subtitles
      const enriched = enrichDeals(deduped, "feed");
      fs.writeFileSync(
        FEED_PATH,
        JSON.stringify(enriched, null, 2),
        "utf8"
      );
      console.log("✅ [Cron] Feed enrichment complete");
    } else {
      console.warn("⚠️ [Cron] Feed file not found — skipping normalization");
    }

    // 4️⃣ Run insight analysis silently (mock res)
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("✅ [Cron] Insight refresh complete");

    // 5️⃣ Run CTA evolution
    evolveCTAs();
    console.log("✅ [Cron] CTA evolution complete");

    const duration = Date.now() - startTime;
    console.log(`✅ [Cron] Full cycle complete in ${duration} ms`);

    res.json({
      message: "Cycle triggered in background.",
      duration,
      previousRun: new Date().toISOString(),
      steps: ["builder", "feed-normalizer", "insight", "cta-evolver"]
    });
  } catch (err) {
    console.error("❌ [Cron] Error:", err);
    res
      .status(500)
      .json({ error: "Cron cycle failed", details: err.message });
  }
}
