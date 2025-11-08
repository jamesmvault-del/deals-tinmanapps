// /api/master-cron.js
// 🔁 TinmanApps Master Cron v3.3 “Feed Sentinel”
// Ensures persistent feed enrichment + fallback CTA/subtitle integrity
// Works seamlessly with proxyCache, insight, and CTA evolver

import fs from "fs";
import path from "path";
import { backgroundRefresh } from "../lib/proxyCache.js";
import { evolveCTAs } from "../lib/ctaEvolver.js";
import { enrichDeals } from "../lib/ctaEngine.js";
import insightHandler from "./insight.js";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// ─────────────────────────────── Helpers ───────────────────────────────
function smartTitle(slug = "") {
  return slug
    ? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()
    : "Untitled";
}

function ensureIntegrity(deals) {
  return deals.map((d) => {
    const title = d.title && d.title.trim().length > 2 ? d.title : smartTitle(d.slug);
    const cta =
      d.seo?.cta && d.seo.cta.trim()
        ? d.seo.cta
        : "Discover this offer →";
    const subtitle =
      d.seo?.subtitle && d.seo.subtitle.trim()
        ? d.seo.subtitle
        : "Explore a fresh deal designed to simplify your workflow.";
    return {
      ...d,
      title,
      seo: { ...(d.seo || {}), cta, subtitle },
    };
  });
}

// ─────────────────────────────── Handler ───────────────────────────────
export default async function handler(req, res) {
  const force = req.query.force === "1";
  const startTime = Date.now();

  try {
    console.log("🔁 [Cron] Starting refresh cycle @", new Date().toISOString());

    // 1️⃣ Refresh AppSumo data (may overwrite feed file)
    await backgroundRefresh();
    console.log("✅ [Cron] Builder refresh complete");

    // 2️⃣ Load feed freshly written by backgroundRefresh
    let feed = [];
    if (fs.existsSync(FEED_PATH)) {
      feed = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
      console.log(`📄 [Cron] Loaded ${feed.length} feed entries`);
    } else {
      console.warn("⚠️ [Cron] No feed file found after refresh.");
    }

    // 3️⃣ Normalize titles & repair slugs
    const normalized = feed.map((deal) => {
      let title = deal.title || deal.name || smartTitle(deal.slug);
      if (!title || title.length < 3) title = smartTitle(deal.slug);
      title = title.replace(/\s+/g, " ").trim();
      return { ...deal, title };
    });

    // 4️⃣ De-duplicate by slug/title
    const deduped = normalized.filter(
      (v, i, a) =>
        a.findIndex(
          (x) =>
            (x.slug && v.slug && x.slug === v.slug) ||
            (x.title && v.title && x.title.toLowerCase() === v.title.toLowerCase())
        ) === i
    );

    // 5️⃣ Enrich feed with CTAs + subtitles (using CTA Engine)
    let enriched = enrichDeals(deduped, "feed");
    enriched = ensureIntegrity(enriched);
    fs.writeFileSync(FEED_PATH, JSON.stringify(enriched, null, 2), "utf8");
    console.log(`✅ [Cron] Feed enrichment complete (${enriched.length} entries)`);

    // 6️⃣ Run silent insight analysis
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("✅ [Cron] Insight refresh complete");

    // 7️⃣ Run CTA evolution
    evolveCTAs();
    console.log("✅ [Cron] CTA evolution complete");

    const duration = Date.now() - startTime;
    console.log(`✅ [Cron] Full cycle complete in ${duration} ms`);

    res.json({
      message: "Cycle triggered in background.",
      duration,
      previousRun: new Date().toISOString(),
      steps: ["builder", "feed-enrich", "insight", "cta-evolver"],
    });
  } catch (err) {
    console.error("❌ [Cron] Error:", err);
    res.status(500).json({ error: "Cron cycle failed", details: err.message });
  }
}
