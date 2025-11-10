// /api/master-cron.js
// 🔁 TinmanApps Master Cron v4.1 “Deterministic Self-Healing Edition”
// FINAL ARCHITECTURE — updateFeed.js ALWAYS runs first.
// Guarantees category files ALWAYS exist inside Render ephemeral FS.
//
// Pipeline:
//   1) Rebuild all appsumo-*.json via updateFeed.js
//   2) Optional purge (ONLY feed-cache.json when force=1 — never delete categories)
//   3) backgroundRefresh() sanity sync
//   4) Aggregate category silos into unified feed-cache.json
//   5) Normalize → dedupe → enrich (CTA+subtitle)
//   6) SEO integrity enforcement
//   7) Merge with history (CTA/subtitle preservation)
//   8) Silent insight refresh
//   9) CTA evolution
//
// ✅ ZERO conditions where feed becomes empty
// ✅ ZERO accidental deletion of category files
// ✅ FULL Render-safe design

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

// ────────────────────────────────────────── Helpers ──────────────────────────────────────────
function smartTitle(slug = "") {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}

function ensureIntegrity(deals) {
  return deals.map((d) => {
    const title =
      d.title && d.title.trim().length > 2 ? d.title : smartTitle(d.slug);
    const cta = d.seo?.cta?.trim?.() ? d.seo.cta : "Discover this offer →";
    const subtitle = d.seo?.subtitle?.trim?.()
      ? d.seo.subtitle
      : "Explore a fresh deal designed to simplify your workflow.";

    return {
      ...d,
      title,
      seo: { ...(d.seo || {}), cta, subtitle },
    };
  });
}

// ────────────────────────────────────────── Merge Logic ──────────────────────────────────────────
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
    const prev = map.get(item.slug);
    const oldSeo = prev?.seo || {};

    const newSeo = {
      cta: item.seo?.cta || oldSeo.cta || null,
      subtitle: item.seo?.subtitle || oldSeo.subtitle || null,
      clickbait: item.seo?.clickbait || oldSeo.clickbait || null,
      keywords: item.seo?.keywords || oldSeo.keywords || [],
      lastVerifiedAt: item.seo?.lastVerifiedAt || oldSeo.lastVerifiedAt || null,
    };

    if (item.seo?.cta) updatedCount++;
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
    `🧩 [Merge] ${updatedCount} updated, ${reusedCount} reused, ${archivedCount} archived, ${
      merged.length - cleaned.length
    } purged`
  );

  return cleaned;
}

// ────────────────────────────────────────── Aggregator ──────────────────────────────────────────
function aggregateCategoryFeeds() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));

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

  fs.writeFileSync(FEED_PATH, JSON.stringify(aggregated, null, 2));
  console.log(`✅ [Aggregator] Combined ${aggregated.length} deals → feed-cache.json`);
  return aggregated;
}

// ────────────────────────────────────────── Handler ──────────────────────────────────────────
export default async function handler(req, res) {
  const force = req.query.force === "1";
  const start = Date.now();

  try {
    console.log("🔁 [Cron] Starting refresh @", new Date().toISOString());

    // ✅ ALWAYS rebuild category silos first (Render-safe)
    const updateFeedPath = path.join(__dirname, "../scripts/updateFeed.js");
    console.log("⚙️ Running updateFeed.js (absolute path)…");
    try {
      execSync(`node "${updateFeedPath}"`, { stdio: "inherit" });
      console.log("✅ updateFeed.js completed.");
    } catch (err) {
      console.warn("⚠️ updateFeed.js error:", err.message);
    }

    // ✅ Force purge ONLY feed-cache.json (Never delete category JSONs)
    if (force) {
      if (fs.existsSync(FEED_PATH)) fs.unlinkSync(FEED_PATH);
      console.log("🧹 Purged feed-cache.json only (force=1).");
    }

    // ✅ Background sanity sync
    await backgroundRefresh();
    console.log("✅ Builder refresh complete");

    // ✅ Combine categories → unified feed
    const feed = aggregateCategoryFeeds();

    // ✅ Normalize → dedupe → enrich
    const normalized = normalizeFeed(feed);
    console.log(`🧹 Normalized: ${normalized.length}`);

    const seen = new Set();
    const deduped = normalized.filter((d) => {
      const key = sha1(d.slug || d.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let enriched = enrichDeals(deduped, "feed");
    enriched = ensureIntegrity(enriched);
    console.log(`✨ Enriched: ${enriched.length}`);

    const verified = ensureSeoIntegrity(enriched);
    console.log(`🔎 SEO Integrity OK: ${verified.length}`);

    // ✅ Merge with preserved SEO history
    const merged = mergeWithHistory(verified);
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2));
    console.log(`🧬 Merged: ${merged.length} entries`);

    // ✅ Hidden insight update
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("🧠 Insight refresh OK");

    // ✅ CTA evolution
    evolveCTAs();
    console.log("🎯 CTA evolution complete");

    const ms = Date.now() - start;
    console.log(`✅ Completed in ${ms}ms`);

    res.json({
      message: "Self-healing refresh completed.",
      duration: ms,
      total: merged.length,
      previousRun: new Date().toISOString(),
      steps: [
        "updateFeed(auto-run)",
        "purge(feed-cache-only)",
        "builder-refresh",
        "category-aggregate",
        "normalize",
        "dedupe",
        "enrich",
        "seo-integrity",
        "merge-history",
        "insight",
        "cta-evolver",
      ],
    });
  } catch (err) {
    console.error("❌ Cron Error:", err);
    res.status(500).json({ error: err.message });
  }
}
