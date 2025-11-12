/**
 * /api/master-cron.js
 * TinmanApps Master Cron v11.0
 * “Absolute Regeneration • Deterministic • Context-Aware • Validation-Safe”
 * ───────────────────────────────────────────────────────────────────────────────
 * ✅ Light Mode — integrity-only (no regeneration) unless forced (?mode=light or CRON_LIGHT_DEFAULT=1)
 * ✅ Heavy Mode — full regeneration using CTA Engine v11.0 (human-tuned, grammar-safe)
 * ✅ Runs updateFeed.js (blocking) to rebuild silos first
 * ✅ sanitize → normalizeFeed → cleanseFeed → regenerateSEO (context-aware)
 * ✅ SEO Integrity v5.0 — validation-only, no mutation
 * ✅ Deterministic entropy + duplication telemetry
 * ✅ feed-cache.json purged only when ?force=1
 * ✅ Strict sequence enforcement: CTA Engine first → Integrity second → Telemetry third
 * ✅ Render-safe, stable, self-healing
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { execSync } from "child_process";

import { backgroundRefresh } from "../lib/proxyCache.js";
import { createCtaEngine, CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";
import { normalizeFeed } from "../lib/feedNormalizer.js";
import { ensureSeoIntegrity } from "../lib/seoIntegrity.js";
import { cleanseFeed } from "../lib/feedCleanser.js";
import insightHandler from "./insight.js";

// ─────────────────────────────────────────── Info / Paths ─────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// ─────────────────────────────────────────── Helpers ───────────────────────────────────────────
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function sanitizeText(input = "") {
  return String(input ?? "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\(undefined\)/gi, "")
    .trim();
}
function clamp(str, n) {
  if (!str) return "";
  if (str.length <= n) return str;
  const cut = str.slice(0, n).replace(/\s+\S*$/, "");
  return (cut || str.slice(0, n)).trim() + "…";
}
function smartTitle(slug = "") {
  return String(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
function ensureMinimalSeo(items) {
  return items.map((d) => {
    const title = sanitizeText(d.title?.trim?.() || smartTitle(d.slug));
    const cta = sanitizeText(d.seo?.cta) || "Discover this deal →";
    const subtitle =
      sanitizeText(d.seo?.subtitle) ||
      "A clean, fast overview to help you evaluate this offer.";
    return { ...d, title, seo: { ...(d.seo || {}), cta, subtitle } };
  });
}
function finalSanitize(items) {
  return items.map((d) => {
    const cta = clamp(sanitizeText(d.seo?.cta || ""), 64);
    const subtitle = clamp(sanitizeText(d.seo?.subtitle || ""), 160);
    return {
      ...d,
      title: sanitizeText(d.title),
      seo: { ...d.seo, cta, subtitle },
    };
  });
}

// ───────────────────────────────────────── Telemetry: duplication & entropy ─────────────────────
function uniqueCount(arr) {
  return new Set(arr.filter(Boolean)).size;
}
function shannonEntropy(arr) {
  const total = arr.length || 1;
  const counts = {};
  for (const x of arr) counts[x] = (counts[x] || 0) + 1;
  let H = 0;
  for (const k in counts) {
    const p = counts[k] / total;
    H += -p * Math.log2(p);
  }
  return Number.isFinite(H) ? H : 0;
}
function logSeoStats(label, deals) {
  const ctas = deals.map((d) => d.seo?.cta || "");
  const subs = deals.map((d) => d.seo?.subtitle || "");
  const uniqCTA = uniqueCount(ctas);
  const uniqSUB = uniqueCount(subs);
  const entCTA = shannonEntropy(ctas).toFixed(2);
  const entSUB = shannonEntropy(subs).toFixed(2);
  const dupCTA = (1 - uniqCTA / (ctas.length || 1)).toFixed(2);
  const dupSUB = (1 - uniqSUB / (subs.length || 1)).toFixed(2);
  console.log(
    `📊 [${label}] CTA uniq=${uniqCTA}/${ctas.length} dup=${dupCTA} H=${entCTA} | SUB uniq=${uniqSUB}/${subs.length} dup=${dupSUB} H=${entSUB}`
  );
}

// ───────────────────────────────────────── Merge with History (NO CTA RESTORE) ───────────────────
function mergeWithHistory(newFeed) {
  if (!fs.existsSync(FEED_PATH)) return newFeed;
  const prev = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  const prevBySlug = new Map(prev.map((x) => [x.slug, x]));
  const now = new Date().toISOString();
  const DAY_MS = 24 * 60 * 60 * 1000;
  let archived = 0;
  let purged = 0;

  const merged = newFeed.map((item) => {
    const old = prevBySlug.get(item.slug);
    const oldSeo = old?.seo || {};
    return {
      ...item,
      seo: {
        cta: item.seo?.cta || null,
        subtitle: item.seo?.subtitle || null,
        clickbait: oldSeo.clickbait || null,
        keywords: oldSeo.keywords || [],
        lastVerifiedAt: now,
      },
      archived: false,
    };
  });

  for (const old of prev) {
    if (!merged.find((x) => x.slug === old.slug)) {
      archived++;
      merged.push({ ...old, archived: true });
    }
  }

  const cutoff = Date.now() - 30 * DAY_MS;
  const cleaned = merged.filter((x) => {
    if (!x.archived) return true;
    const t = x.seo?.lastVerifiedAt
      ? new Date(x.seo.lastVerifiedAt).getTime()
      : Date.now();
    const keep = t > cutoff;
    if (!keep) purged++;
    return keep;
  });

  console.log(`🧬 [History] archived=${archived}, purged=${purged}, final=${cleaned.length}`);
  return cleaned;
}

// ───────────────────────────────────────── Aggregator ────────────────────────────────────────────
function aggregateCategoryFeeds() {
  ensureDir(DATA_DIR);
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));

  let aggregated = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
      aggregated = aggregated.concat(data);
      console.log(`✅ Loaded ${data.length} → ${file}`);
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${file}: ${err.message}`);
    }
  }

  fs.writeFileSync(FEED_PATH, JSON.stringify(aggregated, null, 2));
  return aggregated;
}

// ───────────────────────────────────────── Regeneration (CTA Engine v11) ─────────────────────────
function regenerateSeo(allDeals) {
  const engine = createCtaEngine();
  const runSalt = Date.now().toString();

  return allDeals.map((d) => {
    const category = (d.category || "software").toLowerCase();
    const title = sanitizeText(d.title?.trim?.() || smartTitle(d.slug));
    const description = sanitizeText(d.description || "");
    const slug = d.slug || sha1(title);

    const cta = sanitizeText(engine.generate({ title, category, slug, runSalt }));
    const subtitle = sanitizeText(engine.generateSubtitle({ title, category, slug, runSalt }));
    return { ...d, seo: { ...d.seo, cta, subtitle } };
  });
}

// ───────────────────────────────────────── HANDLER ───────────────────────────────────────────────
export default async function handler(req, res) {
  const force = req.query.force === "1";
  const modeParam = String(req.query.mode || "").toLowerCase();
  const lightDefault = process.env.CRON_LIGHT_DEFAULT === "1";
  const light = !force && (modeParam === "light" || lightDefault);
  const start = Date.now();

  try {
    console.log(
      `🔁 [Cron] ${new Date().toISOString()} | mode=${light ? "LIGHT" : "HEAVY"} | force=${force}`
    );

    // ── LIGHT MODE: integrity only ─────────────────────────────────────────────
    if (light) {
      const bg = await backgroundRefresh();
      const duration = Date.now() - start;
      return res.json({
        message: "Light cron run (validation-only)",
        duration,
        total: bg?.totalEntries ?? 0,
        steps: ["background-refresh(light)"],
        engineVersion: CTA_ENGINE_VERSION,
        regenerated: false,
        mode: "light",
      });
    }

    // ── HEAVY MODE: full regeneration ─────────────────────────────────────────
    const updateFeedPath = path.join(__dirname, "../scripts/updateFeed.js");
    const maxOld = Number(process.env.NODE_MAX_OLD_SPACE || 256);
    console.log(`⚙️ updateFeed.js running with --max-old-space-size=${maxOld}…`);
    try {
      execSync(`node --max-old-space-size=${maxOld} "${updateFeedPath}"`, {
        stdio: "inherit",
        env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${maxOld}` },
      });
      console.log("✅ updateFeed.js complete");
    } catch (e) {
      console.warn("⚠️ updateFeed.js error:", e.message);
    }

    if (force && fs.existsSync(FEED_PATH)) {
      fs.unlinkSync(FEED_PATH);
      console.log("🧹 feed-cache.json purged (force=1)");
    }

    await backgroundRefresh();
    console.log("✅ backgroundRefresh OK");

    const raw = aggregateCategoryFeeds();
    console.log(`📦 Raw aggregated: ${raw.length}`);

    const normalized = normalizeFeed(raw);
    console.log(`🧼 Normalized: ${normalized.length}`);

    const seen = new Set();
    const deduped = normalized.filter((d) => {
      const key = sha1(d.slug || d.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`📑 Deduped: ${deduped.length}`);

    const cleansed = cleanseFeed(deduped);
    console.log(`🧹 Cleansed: ${cleansed.length}`);

    // Regenerate with CTA Engine v11.0 before validation
    let regenerated = regenerateSeo(cleansed);
    console.log(`✨ Regenerated CTA + subtitle (v${CTA_ENGINE_VERSION}, ${regenerated.length})`);

    regenerated = ensureMinimalSeo(regenerated);

    const validated = ensureSeoIntegrity(regenerated);
    console.log(`🔎 SEO Integrity validated (no mutation): ${validated.length}`);

    const sanitized = finalSanitize(validated);
    logSeoStats(`Entropy v${CTA_ENGINE_VERSION}`, sanitized);

    const merged = mergeWithHistory(sanitized);
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2));
    console.log(`🧬 Final merged feed: ${merged.length}`);

    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );

    const duration = Date.now() - start;
    return res.json({
      message: "Full regeneration complete",
      duration,
      total: merged.length,
      previousRun: new Date().toISOString(),
      steps: [
        `updateFeed(blocking: --max-old-space-size=${maxOld})`,
        "purge(feed-cache-only)",
        "background-refresh",
        "aggregate",
        "normalize",
        "dedupe",
        "cleanse",
        `regenerate-seo(v${CTA_ENGINE_VERSION})`,
        "seo-integrity(validate-only)",
        "final-sanitise",
        "merge-history",
        "insight",
      ],
      engineVersion: CTA_ENGINE_VERSION,
      regenerated: true,
      mode: "heavy",
    });
  } catch (err) {
    console.error("❌ [Cron Fatal]:", err);
    return res.status(500).json({ error: "Cron failed", details: err.message });
  }
}
