// /api/master-cron.js
// 🔁 TinmanApps Master Cron v4.0 “Autonomous Path-Stabilized Edition”
// Fully self-contained for Render ephemeral environments.
// Auto-runs updateFeed.js from an absolute path to rebuild category feeds dynamically.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { execSync } from "child_process";
import { backgroundRefresh } from "../lib/proxyCache.js";
import { evolveCTAs } from "../lib/ctaEvolver.js";
import { enrichDeals } from "../lib/ctaEngine.js";
import { normalizeFeed } from "../lib/feedNormalizer.js";
import { ensureSeoIntegrity } from "../lib/seoIntegrity.js";
import insightHandler from "./insight.js";

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
    const cta = d.seo?.cta?.trim?.() ? d.seo.cta : "Discover this offer →";
    const subtitle = d.seo?.subtitle?.trim?.()
      ? d.seo.subtitle
      : "Explore a fresh deal designed to simplify your workflow.";
    return { ...d, title, seo: { ...(d.seo || {}), cta, subtitle } };
  });
}

// ─────────────────────────────── Merge Logic ───────────────────────────────
function mergeWithHistory(newFeed) {
  if (!fs.existsSync(FEED_PATH)) return newFeed;

  const oldFeed = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  const map = new Map(oldFeed.map((x) => [x.slug, x]));
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let updatedCount = 0;
  let reusedCount = 0;
  let archivedCount = 0;

  const merged = newFeed.map((item) => {
    const old = map.get(item.slug);
    const preservedSeo = old?.seo || {};
    const oldTime = preservedSeo.lastVerifiedAt
      ? new Date(preservedSeo.lastVerifiedAt).getTime()
      : 0;
    const isFreshOld = now - oldTime < DAY_MS;

    const newSeo = {
      cta:
        item.seo?.cta && item.seo.cta.trim().length > 0
          ? item.seo.cta
          : preservedSeo.cta || null,
      subtitle:
        item.seo?.subtitle && item.seo.subtitle.trim().length > 0
          ? item.seo.subtitle
          : preservedSeo.subtitle || null,
      clickbait:
        item.seo?.clickbait && item.seo.clickbait.trim().length > 0
          ? item.seo.clickbait
          : preservedSeo.clickbait || null,
      keywords:
        Array.isArray(item.seo?.keywords) && item.seo.keywords.length
          ? item.seo.keywords
          : preservedSeo.keywords || [],
      lastVerifiedAt: item.seo?.lastVerifiedAt || preservedSeo.lastVerifiedAt || null,
    };

    if (item.seo?.cta && item.seo.cta.trim().length > 0) updatedCount++;
    else reusedCount++;

    return { ...item, seo: newSeo, archived: false };
  });

  for (const old of oldFeed) {
    if (!merged.find((x) => x.slug === old.slug)) {
      merged.push({ ...old, archived: true });
      archivedCount++;
    }
  }

  const cutoff = now - 30 * DAY_MS;
  const cleaned = merged.filter((x) => {
    if (!x.archived) return true;
    const t = x.seo?.lastVerifiedAt
      ? new Date(x.seo.lastVerifiedAt).getTime()
      : now;
    return t > cutoff;
  });

  console.log(
    `🧩 [Merge] ${updatedCount} updated, ${reusedCount} reused, ${archivedCount} archived, ${merged.length - cleaned.length} purged`
  );

  return cleaned;
}

// ─────────────────────────────── Aggregator ───────────────────────────────
function aggregateCategoryFeeds() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));
  let aggregated = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
      aggregated = aggregated.concat(data);
      console.log(`✅ Loaded ${data.length} from ${file}`);
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${file}: ${err.message}`);
    }
  }
  fs.writeFileSync(FEED_PATH, JSON.stringify(aggregated, null, 2), "utf8");
  console.log(`✅ [Aggregator] Combined ${aggregated.length} deals → feed-cache.json`);
  return aggregated;
}

// ─────────────────────────────── Handler ───────────────────────────────
export default async function handler(req, res) {
  const force = req.query.force === "1";
  const startTime = Date.now();

  try {
    console.log("🔁 [Cron] Starting refresh cycle @", new Date().toISOString());

    // 0️⃣ Always ensure category feeds exist inside Render’s ephemeral FS
    const updateFeedPath = path.join(__dirname, "../scripts/updateFeed.js");
    console.log("⚙️ [Cron] Running updateFeed.js to rebuild category feeds...");
    try {
      execSync(`node ${updateFeedPath}`, { stdio: "inherit" });
      console.log("✅ [Cron] Category feeds regenerated successfully.");
    } catch (err) {
      console.warn("⚠️ [Cron] updateFeed.js failed to execute:", err.message);
    }

    // 1️⃣ Optional cache purge (when force=1)
    if (force) {
      const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("appsumo-") || f === "feed-cache.json");
      for (const f of files) fs.unlinkSync(path.join(DATA_DIR, f));
      console.log(`🧹 [Purge] Removed ${files.length} cached files.`);
    }

    // 2️⃣ Background AppSumo refresh
    await backgroundRefresh();
    console.log("✅ [Cron] Builder refresh complete");

    // 3️⃣ Aggregate category JSONs → unified feed
    const feed = aggregateCategoryFeeds();

    // 4️⃣ Normalize unified feed
    const normalized = normalizeFeed(feed);
    console.log(`🧹 [Cron] Feed normalized (${normalized.length})`);

    // 5️⃣ Deduplicate
    const seen = new Set();
    const deduped = normalized.filter((item) => {
      const key = sha1(item.slug || item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 6️⃣ Enrich with CTAs + subtitles
    let enriched = enrichDeals(deduped, "feed");
    enriched = ensureIntegrity(enriched);
    console.log(`✅ [Cron] Feed enriched (${enriched.length})`);

    // 7️⃣ SEO Integrity checks
    const verified = ensureSeoIntegrity(enriched);
    console.log(`🔎 [Cron] SEO Integrity check complete (${verified.length})`);

    // 8️⃣ Merge with history
    const merged = mergeWithHistory(verified);
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
    console.log(`🧬 [Cron] Feed merged (${merged.length} entries)`);

    // 9️⃣ Insight refresh
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("✅ [Cron] Insight refresh complete");

    // 🔟 CTA evolution
    evolveCTAs();
    console.log("✅ [Cron] CTA evolution complete");

    const duration = Date.now() - startTime;
    console.log(`✅ [Cron] Full cycle complete in ${duration} ms`);

    res.json({
      message: "Full refresh completed with absolute path feed regeneration.",
      duration,
      total: merged.length,
      previousRun: new Date().toISOString(),
      steps: [
        "updateFeed(auto-run, absolute path)",
        "cache-purge(optional)",
        "builder-refresh",
        "category-aggregate",
        "feed-normalize",
        "feed-enrich",
        "seo-integrity",
        "merge-history",
        "insight",
        "cta-evolver",
      ],
    });
  } catch (err) {
    console.error("❌ [Cron] Error:", err);
    res.status(500).json({ error: "Cron cycle failed", details: err.message });
  }
}
