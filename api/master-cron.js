// /api/master-cron.js
// 🔁 TinmanApps Master Cron v3.6 “Omni Feed Guardian + Sanctifier Prime+ Entropy Fix”
// Ensures persistent normalization, enrichment, SEO verification, CTA evolution,
// and historical merge with freshness and duplication control.
// Integrates seoIntegrity() for metadata enrichment.

import fs from "fs";
import path from "path";
import { backgroundRefresh } from "../lib/proxyCache.js";
import { evolveCTAs } from "../lib/ctaEvolver.js";
import { enrichDeals } from "../lib/ctaEngine.js";
import { normalizeFeed } from "../lib/feedNormalizer.js";
import { ensureSeoIntegrity } from "../lib/seoIntegrity.js";
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

// ─────────────────────────────── Merge Logic ───────────────────────────────
// Fresh-first SEO priority with freshness gating and archive cleanup.
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

    return {
      ...item,
      seo: newSeo,
      archived: false,
    };
  });

  // Add archived items not present in the new feed
  for (const old of oldFeed) {
    if (!merged.find((x) => x.slug === old.slug)) {
      merged.push({ ...old, archived: true });
      archivedCount++;
    }
  }

  // Purge archived items older than 30 days
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

    // 6️⃣ Apply SEO Integrity verification + metadata enrichment
    const verified = ensureSeoIntegrity(enriched);
    console.log(`🔎 [Cron] SEO Integrity check complete (${verified.length})`);

    // 7️⃣ Merge with historical data (fresh-first logic)
    const merged = mergeWithHistory(verified);
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
    console.log(
      `🧬 [Cron] Feed merged (${merged.length} entries, ${
        merged.filter((f) => f.archived).length
      } archived)`
    );

    // 8️⃣ Run silent insight refresh
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("✅ [Cron] Insight refresh complete");

    // 9️⃣ Run CTA evolution
    evolveCTAs();
    console.log("✅ [Cron] CTA evolution complete");

    const duration = Date.now() - startTime;
    console.log(`✅ [Cron] Full cycle complete in ${duration} ms`);

    res.json({
      message: "Cycle triggered in background.",
      duration,
      previousRun: new Date().toISOString(),
      steps: [
        "builder",
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
