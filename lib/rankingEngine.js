// /lib/rankingEngine.js
// TinmanApps — Smart Ranking Engine v2.0 “Momentum-Semantic Adaptive Dominator”
// ───────────────────────────────────────────────────────────────────────────────
// Mission:
// • Adaptive ranking: CTR → semantic → long-tail → insight momentum → freshness
// • Seamless fit with Feed Engine v7.x, CTA Engine v4.x, Insight Pulse v3.x
// • CTR decay + UCB exploration to avoid stagnation
// • Deterministic SHA1 slug fallback for stable ordering
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
  ctr: 0.48,             // historical behaviour
  momentum: 0.22,        // from insight-latest.json (keyword momentum)
  semantic: 0.18,        // cluster match
  longTail: 0.08,        // rarity
  freshness: 0.04,       // category freshness
};

const EXPLORE = {
  epsilon: 0.04,
  ucbK: 1.15,
};

const STOPWORDS = new Set([
  "the","a","an","and","of","for","to","with","in","on","by","your","you","from","at","as",
  "into","via","over","under","it","its","this","that","is","are","be","or","&","—","-"
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
// CTR + Recency + UCB
// ───────────────────────────────────────────────────────────────────────────────
function ctrIndex(ctr) {
  const map = ctr.byDeal || {};
  let min = Infinity,
    max = -Infinity;
  for (const slug in map) {
    const v = map[slug];
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return {
    map,
    min: isFinite(min) ? min : 0,
    max: isFinite(max) ? max : 1,
  };
}

function decayedCtr(slug, ctrIdx, recent = []) {
  const base = ctrIdx.map[slug] || 0;
  const baseNorm = normalize01(base, ctrIdx.min, ctrIdx.max);

  let rec = 0;
  for (let i = 0; i < Math.min(100, recent.length); i++) {
    if (recent[i]?.deal === slug) rec += (100 - i) / 100;
  }
  rec = Math.min(1, rec * 0.25);

  return Math.min(1, baseNorm * 0.85 + rec * 0.15);
}

function exploreBoost(slug, ctr, totalClicks) {
  const clicks = ctr.byDeal?.[slug] || 0;
  const n = Math.max(1, clicks);
  const t = Math.max(1, totalClicks);

  const ucb = Math.sqrt(Math.log(t + 2) / n) * EXPLORE.ucbK;
  const eps = Math.random() * EXPLORE.epsilon;

  return Math.min(1, ucb + eps);
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
// MAIN — rankDeals()
// ───────────────────────────────────────────────────────────────────────────────
export function rankDeals(deals = [], category = "software") {
  const ctr = loadJsonSafe(CTR_PATH, {
    totalClicks: 0,
    byDeal: {},
    recent: [],
  });
  const ctrIdx = ctrIndex(ctr);
  const insight = loadJsonSafe(INSIGHT_PATH, { categories: {} });
  const fresh = freshnessScore(category);

  const results = deals.map((d) => {
    const src = d.url || d.link || d.product_url || "";
    const slug =
      d.slug ||
      src.match(/products\/([^/]+)/)?.[1] ||
      crypto.createHash("sha1").update(String(d.title || src)).digest("hex").slice(0, 10);

    const title = d.title || slug;

    // NLP features
    const tokens = tokenize(title + " " + src);
    const phrases = ngrams(tokens, 3);

    const sCTR = decayedCtr(slug, ctrIdx, ctr.recent || []);
    const sSem = semanticScore(category, title);
    const sTail = rarityScore(phrases);
    const sFresh = fresh;
    const sMom = momentumScore(title, category, insight);

    const explore = exploreBoost(slug, ctr, ctr.totalClicks);

    let score =
      sCTR * WEIGHTS.ctr +
      sMom * WEIGHTS.momentum +
      sSem * WEIGHTS.semantic +
      sTail * WEIGHTS.longTail +
      sFresh * WEIGHTS.freshness;

    score = Math.min(1, score * (1 + explore * 0.1));

    return {
      slug,
      score,
      deal: d,
    };
  });

  results.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  return results.map((x) => x.deal);
}

// ───────────────────────────────────────────────────────────────────────────────
// Debug helper for inspection (/api/debug-rank.js)
// ───────────────────────────────────────────────────────────────────────────────
export function debugRank(deals = [], category = "software", top = 12) {
  const ctr = loadJsonSafe(CTR_PATH, {
    totalClicks: 0,
    byDeal: {},
    recent: [],
  });
  const ctrIdx = ctrIndex(ctr);
  const insight = loadJsonSafe(INSIGHT_PATH, { categories: {} });
  const fresh = freshnessScore(category);

  const rows = deals.map((d) => {
    const src = d.url || d.link || d.product_url || "";
    const slug =
      d.slug ||
      src.match(/products\/([^/]+)/)?.[1] ||
      crypto.createHash("sha1").update(String(d.title || src)).digest("hex").slice(0, 10);

    const title = d.title || slug;

    const tokens = tokenize(title + " " + src);
    const phrases = ngrams(tokens, 3);

    const sCTR = decayedCtr(slug, ctrIdx, ctr.recent || []);
    const sSem = semanticScore(category, title);
    const sTail = rarityScore(phrases);
    const sFresh = fresh;
    const sMom = momentumScore(title, category, insight);
    const explore = exploreBoost(slug, ctr, ctr.totalClicks);

    let score =
      sCTR * WEIGHTS.ctr +
      sMom * WEIGHTS.momentum +
      sSem * WEIGHTS.semantic +
      sTail * WEIGHTS.longTail +
      sFresh * WEIGHTS.freshness;
    score = Math.min(1, score * (1 + explore * 0.1));

    return {
      slug,
      title,
      score: +score.toFixed(4),
      ctr: +sCTR.toFixed(3),
      momentum: +sMom.toFixed(3),
      semantic: +sSem.toFixed(3),
      longTail: +sTail.toFixed(3),
      freshness: +sFresh.toFixed(3),
      explore: +explore.toFixed(3),
    };
  });

  rows.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return rows.slice(0, top);
}

export default { rankDeals, debugRank };
