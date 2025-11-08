// /api/master-cron.js
// 🔁 TinmanApps Master Cron v3.4 “Omni Feed Guardian”
// Ensures persistent normalization, enrichment, CTA evolution, and feed merging.
// Integrates normalizeFeed() + mergeWithHistory() from updateFeed.
// Designed for continuous AppSumo ingestion, non-destructive SEO retention,
// and immediate CTA evolution self-optimization.

import fs from "fs";
import path from "path";
import { backgroundRefresh } from "../lib/proxyCache.js";
import { evolveCTAs } from "../lib/ctaEvolver.js";
import { enrichDeals } from "../lib/ctaEngine.js";
import { normalizeFeed } from "../lib/feedNormalizer.js";
import insightHandler from "./insight.js";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// ─────────────────────────────── Helpers ───────────────────────────────
function smartTitle(slug = "") {
  return slug
    ? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()
    : "Untitled";
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}

function ensureIntegrity(deals) {
  return deals.map((d) => {
    const title = d.title && d.title.trim().length > 2 ? d.title : smartTitle(d.slug);
    const cta = d.seo?.cta?.trim?.()
      ? d.seo.cta
      : "Discover this offer →";
    const subtitle = d.seo?.subtitle?.trim?.()
      ? d.seo.subtitle
      : "Explore a fresh deal designed to simplify your workflow.";
    return { ...d, title, seo: { ...(d.seo || {}), cta, subtitle } };
  });
}

// Merge current feed with historical entries (preserving SEO metadata)
function mergeWithHistory(newFeed) {
  if (!fs.existsSync(FEED_PATH)) return newFeed;

  const oldFeed = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  const map = new Map(oldFeed.map((x) => [x.slug, x]));

  const merged = newFeed.map((item) => {
    const old = map.get(item.slug);
    const preservedSeo = old?.seo || {};
    return {
      ...item,
      seo: {
        cta: item.seo?.cta || preservedSeo.cta || null,
        subtitle: item.seo?.subtitle || preservedSeo.subtitle || null,
      },
      archived: false,
    };
  });

  for (const old of oldFeed) {
    if (!merged.find((x) => x.slug === old.slug)) {
      merged.push({ ...old, archived: true });
    }
  }

  return merged;
}

// ─────────────────────────────── Handler ───────────────────────────────
export default async function handler(req, res) {
  const force = req.query.force === "1";
  const startTime = Date.now();

  try {
    console.log("🔁 [Cron] Starting refresh cycle @", new Date().toISOString());

    // 1️⃣ Refresh AppSumo data
    await backgroundRefresh();
    console.log("✅ [Cron] Builder refresh complete");

    // 2️⃣ Load or initialize feed
    let feed = [];
    if (fs.existsSync(FEED_PATH)) {
      feed = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
      console.log(`📄 [Cron] Loaded ${feed.length} feed entries`);
    } else {
      console.warn("⚠️ [Cron] No existing feed found, initializing new cache.");
    }

    // 3️⃣ Normalize feed
    const normalized = normalizeFeed(feed);
    console.log(`🧹 [Cron] Feed normalized (${normalized.length})`);

    // 4️⃣ Deduplicate by slug/title hash
    const seen = new Set();
    const deduped = normalized.filter((item) => {
      const key = sha1(item.slug || item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 5️⃣ Enrich feed with CTAs/subtitles
    let enriched = enrichDeals(deduped, "feed");
    enriched = ensureIntegrity(enriched);
    console.log(`✅ [Cron] Feed enriched (${enriched.length})`);

    // 6️⃣ Merge with historical data
    const merged = mergeWithHistory(enriched);
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
    console.log(`🧬 [Cron] Feed merged (${merged.length} entries, ${merged.filter(f => f.archived).length} archived)`);

    // 7️⃣ Run silent insight refresh
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("✅ [Cron] Insight refresh complete");

    // 8️⃣ Run CTA evolution
    evolveCTAs();
    console.log("✅ [Cron] CTA evolution complete");

    const duration = Date.now() - startTime;
    console.log(`✅ [Cron] Full cycle complete in ${duration} ms`);

    res.json({
      message: "Cycle triggered in background.",
      duration,
      previousRun: new Date().toISOString(),
      steps: ["builder", "feed-normalize", "feed-enrich", "merge-history", "insight", "cta-evolver"],
    });
  } catch (err) {
    console.error("❌ [Cron] Error:", err);
    res.status(500).json({ error: "Cron cycle failed", details: err.message });
  }
}
