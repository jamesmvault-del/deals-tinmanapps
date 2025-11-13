// /lib/rankingEngine.js
// TinmanApps — Smart Ranking Engine v3.0 “CTR-UCB Momentum Navigator”
// ───────────────────────────────────────────────────────────────────────────────
// Mission:
// • Adaptive ranking: CTR → semantic → long-tail → insight momentum → freshness
// • NEW: CTR-weighted UCB exploration to:
//     - Boost emerging deals with promising early clicks
//     - Gently downgrade stale winners with aging click history
// • Seamless fit with Feed Engine v7.x+, CTA Engine v11.x, Insight Pulse v6.x
// • Deterministic (no randomness) with SHA1 slug fallback for stable ordering
// • Pure Node, zero deps, Render-safe
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";
import { detectCluster } from "./semanticCluster.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_PATH = path.join(DATA_DIR, "ctr-insights.json");
const INSIGHT_PATH = path.join(DATA_DIR, "insight-latest.json");

// ───────────────────────────────────────────────────────────────────────────────
// Tunable weights
// ───────────────────────────────────────────────────────────────────────────────
const WEIGHTS = {
  ctr: 0.48, // historical behaviour (click strength)
  momentum: 0.22, // from insight-latest.json (keyword momentum)
  semantic: 0.18, // cluster match
  longTail: 0.08, // rarity
  freshness: 0.04, // category freshness
};

// Exploration: pure UCB-style, no RNG (deterministic)
const EXPLORE = {
  mix: 0.22, // how much UCB influences final score (0..1)
  ucbK: 1.2, // exploration constant
};

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "of",
  "for",
  "to",
  "with",
  "in",
  "on",
  "by",
  "your",
  "you",
  "from",
  "at",
  "as",
  "into",
  "via",
  "over",
  "under",
  "it",
  "its",
  "this",
  "that",
  "is",
  "are",
  "be",
  "or",
  "&",
  "—",
  "-",
]);

// ───────────────────────────────────────────────────────────────────────────────
// IO helpers
// ───────────────────────────────────────────────────────────────────────────────
function loadJsonSafe(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function fileMtimeISO(p) {
  try {
    return fs.statSync(p).mtime.toISOString();
  } catch {
    return null;
  }
}

// CTR record helpers — support both legacy number and structured object:
//   byDeal[slug] = <number>
//   or
//   byDeal[slug] = { clicks, count, lastClickAt, last }
function extractClicks(rec) {
  if (rec == null) return 0;
  if (typeof rec === "number") return Math.max(0, rec);
  if (typeof rec === "object") {
    const raw = rec.clicks ?? rec.count ?? 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function extractLastClickISO(rec) {
  if (!rec || typeof rec !== "object") return null;
  return rec.lastClickAt || rec.last || null;
}

function daysSince(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  const ms = Date.now() - t;
  return Math.max(0, ms / 86400000);
}

// ───────────────────────────────────────────────────────────────────────────────
// Text Processing
// ───────────────────────────────────────────────────────────────────────────────
function tokenize(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w));
}

function ngrams(tokens, max = 3) {
  const out = [];
  for (let n = 1; n <= max; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      out.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return out;
}

function rarityScore(phrases) {
  let best = 0;
  for (const p of phrases) {
    const len = p.split(" ").length;
    if (len === 1) best = Math.max(best, 0.2);
    if (len === 2) best = Math.max(best, 0.55);
    if (len >= 3) best = Math.max(best, 1.0);
  }
  return best;
}

function normalize01(x, min, max) {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (x - min) / (max - min)));
}

// ───────────────────────────────────────────────────────────────────────────────
// CTR + Recency Index
// ───────────────────────────────────────────────────────────────────────────────
function ctrIndex(ctr) {
  const map = ctr.byDeal || {};
  let min = Infinity;
  let max = -Infinity;
  let totalClicks = 0;

  for (const slug in map) {
    const rec = map[slug];
    const clicks = extractClicks(rec);
    if (!clicks) continue;
    min = Math.min(min, clicks);
    max = Math.max(max, clicks);
    totalClicks += clicks;
  }

  if (!isFinite(min)) min = 0;
  if (!isFinite(max) || max <= 0) max = min > 0 ? min : 1;

  // fall back to ctr.totalClicks if present & > computed
  const declaredTotal =
    typeof ctr.totalClicks === "number" ? Math.max(0, ctr.totalClicks) : 0;
  if (declaredTotal > totalClicks) totalClicks = declaredTotal;

  return {
    map,
    min,
    max,
    totalClicks: totalClicks || 1,
  };
}

// CTR strength with recency decay (used in exploitation score)
function decayedCtr(slug, ctrIdx, recent = []) {
  const rec = ctrIdx.map[slug] ?? null;
  const clicks = extractClicks(rec);

  const baseNorm = normalize01(clicks, ctrIdx.min, ctrIdx.max);

  // Recent click trail reinforcement (recent[0] = newest)
  let recencyTrail = 0;
  for (let i = 0; i < Math.min(100, recent.length); i++) {
    if (recent[i]?.deal === slug) {
      // more weight for very recent
      recencyTrail += (100 - i) / 100;
    }
  }
  recencyTrail = Math.min(1, recencyTrail * 0.25); // cap + scale

  // Hard recency decay using lastClickAt if available
  const lastIso = extractLastClickISO(rec);
  const age = daysSince(lastIso);
  // In 0 days → factor ~1, in 60+ days → down to 0.3
  const hardRecency = !Number.isFinite(age)
    ? 1
    : Math.max(0.3, 1 - age / 60);

  const ctrStrength = Math.min(
    1,
    baseNorm * 0.8 * hardRecency + recencyTrail * 0.2
  );

  return ctrStrength;
}

// ───────────────────────────────────────────────────────────────────────────────
// CTR-weighted UCB exploration (deterministic)
//   • High-CTR & low-click deals get strongest exploration boost (emerging)
//   • High-CTR & high-click but recent → stabilised but still strong
//   • Very old winners see their UCB contribution decay over time (stale)
// ───────────────────────────────────────────────────────────────────────────────
function ucbExplore(slug, ctr, ctrIdx) {
  const rec = ctrIdx.map[slug] ?? null;
  const clicks = extractClicks(rec);
  const lastIso = extractLastClickISO(rec);
  const age = daysSince(lastIso);

  const n = Math.max(1, clicks);
  const t = Math.max(ctrIdx.totalClicks, n + 1);

  // Normalised CTR as exploitation core
  const baseNorm = normalize01(clicks, ctrIdx.min, ctrIdx.max);

  // Exploration bonus: sqrt(log(t)/n)
  let bonus = Math.sqrt(Math.log(t + 1) / n) * EXPLORE.ucbK;

  // Recency factor: newer → closer to 1, stale (90+ days) → ~0.4
  const recencyFactor = !Number.isFinite(age)
    ? 1
    : Math.max(0.4, 1 - age / 90);

  bonus *= recencyFactor;

  const ucb = Math.min(1, baseNorm + bonus);
  return ucb;
}

// ───────────────────────────────────────────────────────────────────────────────
// Freshness score by category file mtime
// ───────────────────────────────────────────────────────────────────────────────
function freshnessScore(category) {
  const p = path.join(DATA_DIR, `appsumo-${category}.json`);
  const iso = fileMtimeISO(p);
  if (!iso) return 0.4;

  const ageDays = (Date.now() - new Date(iso).getTime()) / 86400000;
  return Math.max(0.1, 1 - ageDays / 12);
}

// ───────────────────────────────────────────────────────────────────────────────
// Insight momentum (from insight-latest.json)
// expects insight.categories[cat].keywordMomentum[word] weights
// ───────────────────────────────────────────────────────────────────────────────
function momentumScore(title = "", cat = "", insight = {}) {
  const words = tokenize(title);
  const prev = insight.categories?.[cat]?.keywordMomentum || {};

  let sum = 0;
  for (const w of words) {
    if (prev[w]) sum += prev[w];
  }
  return Math.min(1, sum);
}

// ───────────────────────────────────────────────────────────────────────────────
// Semantic cluster coherence
// ───────────────────────────────────────────────────────────────────────────────
function semanticScore(category, title) {
  const cluster = detectCluster(title);
  if (cluster === category) return 1.0;

  const families = {
    ai: ["productivity", "marketing", "web", "creative", "software"],
    marketing: ["ai", "web", "business", "creative", "software"],
    productivity: ["business", "software", "ai", "web"],
    web: ["seo", "creative", "marketing", "software"],
    business: ["marketing", "productivity", "software"],
    courses: ["education", "ai", "productivity"],
    software: ["marketing", "productivity", "business", "ai"],
  };

  if ((families[category] || []).includes(cluster)) return 0.6;
  return 0.25;
}

// ───────────────────────────────────────────────────────────────────────────────
// CORE SCORING (exploitation + exploration blend)
// ───────────────────────────────────────────────────────────────────────────────
function baseScoreForDeal({
  slug,
  title,
  category,
  src,
  ctr,
  ctrIdx,
  insight,
  fresh,
}) {
  const tokens = tokenize(title + " " + src);
  const phrases = ngrams(tokens, 3);

  const sCTR = decayedCtr(slug, ctrIdx, ctr.recent || []);
  const sSem = semanticScore(category, title);
  const sTail = rarityScore(phrases);
  const sFresh = fresh;
  const sMom = momentumScore(title, category, insight);

  let score =
    sCTR * WEIGHTS.ctr +
    sMom * WEIGHTS.momentum +
    sSem * WEIGHTS.semantic +
    sTail * WEIGHTS.longTail +
    sFresh * WEIGHTS.freshness;

  return {
    base: Math.max(0, Math.min(1, score)),
    features: { sCTR, sSem, sTail, sFresh, sMom },
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN — rankDeals()
// ───────────────────────────────────────────────────────────────────────────────
export function rankDeals(deals = [], category = "software") {
  const cat = String(category || "software").toLowerCase();

  const ctr = loadJsonSafe(CTR_PATH, {
    totalClicks: 0,
    byDeal: {},
    recent: [],
  });
  const ctrIdx = ctrIndex(ctr);
  const insight = loadJsonSafe(INSIGHT_PATH, { categories: {} });
  const fresh = freshnessScore(cat);

  const results = deals.map((d) => {
    const src = d.url || d.link || d.product_url || "";
    const slug =
      d.slug ||
      src.match(/products\/([^/]+)/)?.[1] ||
      crypto
        .createHash("sha1")
        .update(String(d.title || src))
        .digest("hex")
        .slice(0, 10);

    const title = d.title || slug;

    const { base, features } = baseScoreForDeal({
      slug,
      title,
      category: cat,
      src,
      ctr,
      ctrIdx,
      insight,
      fresh,
    });

    // CTR-weighted UCB exploration
    const ucb = ucbExplore(slug, ctr, ctrIdx);

    // Final blend (deterministic):
    //   • base = exploitation (multi-signal ranking)
    //   • ucb = exploration (emerging/stale correction)
    const score =
      base * (1 - EXPLORE.mix) + ucb * EXPLORE.mix;

    return {
      slug,
      score: Math.max(0, Math.min(1, score)),
      base,
      ucb,
      deal: d,
      features,
    };
  });

  // Deterministic ordering: score desc, then slug asc
  results.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  return results.map((x) => x.deal);
}

// ───────────────────────────────────────────────────────────────────────────────
// Debug helper for inspection (/api/debug-rank.js)
// ───────────────────────────────────────────────────────────────────────────────
export function debugRank(deals = [], category = "software", top = 12) {
  const cat = String(category || "software").toLowerCase();

  const ctr = loadJsonSafe(CTR_PATH, {
    totalClicks: 0,
    byDeal: {},
    recent: [],
  });
  const ctrIdx = ctrIndex(ctr);
  const insight = loadJsonSafe(INSIGHT_PATH, { categories: {} });
  const fresh = freshnessScore(cat);

  const rows = deals.map((d) => {
    const src = d.url || d.link || d.product_url || "";
    const slug =
      d.slug ||
      src.match(/products\/([^/]+)/)?.[1] ||
      crypto
        .createHash("sha1")
        .update(String(d.title || src))
        .digest("hex")
        .slice(0, 10);

    const title = d.title || slug;

    const { base, features } = baseScoreForDeal({
      slug,
      title,
      category: cat,
      src,
      ctr,
      ctrIdx,
      insight,
      fresh,
    });

    const ucb = ucbExplore(slug, ctr, ctrIdx);
    const score =
      base * (1 - EXPLORE.mix) + ucb * EXPLORE.mix;

    return {
      slug,
      title,
      score: +score.toFixed(4),
      base: +base.toFixed(4),
      ucb: +ucb.toFixed(4),
      ctr: +features.sCTR.toFixed(3),
      momentum: +features.sMom.toFixed(3),
      semantic: +features.sSem.toFixed(3),
      longTail: +features.sTail.toFixed(3),
      freshness: +features.sFresh.toFixed(3),
    };
  });

  rows.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return rows.slice(0, top);
}

export default { rankDeals, debugRank };
