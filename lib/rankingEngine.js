// /lib/rankingEngine.js
// TinmanApps — Smart Ranking Engine v1.0 “Explore–Exploit Semantic CTR”
// ───────────────────────────────────────────────────────────────────────────────
// Mission fit:
// • Prioritizes real CTR performance while discovering low-hanging long-tails
// • Blends semantic relevance, keyword rarity, and freshness
// • Self-correcting via decayed engagement + exploration boost
// • Pure Node (no deps). Compatible with Feed Engine v6.x and CTA v3.x
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";
import { detectCluster } from "./semanticCluster.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_PATH = path.join(DATA_DIR, "ctr-insights.json");

// ---------- Config (tunable without code rewrites) ----------
const WEIGHTS = {
  ctr: 0.55,            // historical engagement (decayed)
  semantic: 0.25,       // match to category cluster + title coherence
  longTail: 0.12,       // keyword rarity & phrase length bias
  freshness: 0.08,      // newer items get a nudge (if we can infer)
};

const EXPLORE = {
  enabled: true,
  epsilon: 0.05,        // small random exploration
  ucbK: 1.2,            // gentle UCB-style boost for low-sample deals
};

const MAX_KEYWORD_LEN = 3; // prefer 2–3 word keyphrases for long-tail
const STOPWORDS = new Set([
  "the","a","an","and","of","for","to","with","in","on","by","your","you","from","at","as",
  "into","via","over","under","it","its","this","that","is","are","be","or","&","—","-"
]);

// ---------- IO ----------
function loadJsonSafe(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}
function fileMtimeISO(p) {
  try { return fs.statSync(p).mtime.toISOString(); }
  catch { return null; }
}

// ---------- Text utils ----------
function tokenize(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !STOPWORDS.has(w));
}

function ngrams(tokens, maxLen = MAX_KEYWORD_LEN) {
  const out = [];
  for (let n = 1; n <= maxLen; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      out.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return out;
}

function rarityScore(phrases) {
  // Longer phrases (2–3 words) and less common tokens get a bump.
  // Here we approximate rarity by length; full IDF can be added later.
  let best = 0;
  for (const p of phrases) {
    const len = p.split(" ").length;
    if (len === 1) best = Math.max(best, 0.15);
    if (len === 2) best = Math.max(best, 0.6);
    if (len >= 3) best = Math.max(best, 1.0);
  }
  return best; // normalized 0..1
}

function normalize01(x, min, max) {
  if (max <= min) return 0;
  const v = (x - min) / (max - min);
  return Math.max(0, Math.min(1, v));
}

// ---------- CTR & decay ----------
function buildCtrIndex(ctr) {
  const byDeal = ctr?.byDeal || {};
  let min = Infinity, max = -Infinity;
  for (const k in byDeal) {
    const v = byDeal[k] || 0;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { byDeal, min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 1 };
}

function decayedCtrScore(slug, ctrIndex, recent = []) {
  const base = ctrIndex.byDeal[slug] || 0;

  // Recent clicks (last 100) — give a small recency edge
  let recentBoost = 0;
  for (let i = 0; i < Math.min(100, recent.length); i++) {
    const r = recent[i];
    if (r?.deal === slug) {
      // linearly decaying boost
      recentBoost += Math.max(0.0, (100 - i) / 100) * 0.5; // cap 0.5
    }
  }

  // Normalize base CTR into 0..1
  const baseNorm = normalize01(base, ctrIndex.min, ctrIndex.max);

  return Math.max(0, Math.min(1, baseNorm * 0.85 + recentBoost * 0.15));
}

// ---------- Freshness ----------
function inferFreshnessISO(category) {
  // Use file mtime of the category JSON as a proxy for page freshness
  const p = path.join(DATA_DIR, `appsumo-${category}.json`);
  const iso = fileMtimeISO(p);
  if (!iso) return 0.5;
  const now = Date.now();
  const ageDays = Math.max(0, (now - new Date(iso).getTime()) / 86400000);
  // 0 days → 1.0 ; 14+ days → ~0.1
  const score = Math.max(0.1, 1.0 - ageDays / 14);
  return Math.max(0, Math.min(1, score));
}

// ---------- Semantic relevance ----------
function semanticMatch(category, title) {
  const cluster = detectCluster(title) || category;
  // Perfect match = 1, adjacent family = 0.6, otherwise 0.25
  if (cluster === category) return 1.0;

  const families = {
    ai: ["productivity","marketing","web","creative","software"],
    marketing: ["business","web","creative","software"],
    productivity: ["business","ai","software","web"],
    web: ["creative","marketing","software"],
    business: ["marketing","productivity","software"],
    ecommerce: ["marketing","web","business"],
    creative: ["web","marketing","software"],
    software: ["ai","marketing","productivity","web","business"]
  };
  if ((families[category] || []).includes(cluster)) return 0.6;
  return 0.25;
}

// ---------- Exploration (UCB-ish) ----------
function explorationBoost(slug, ctr, totalClicks) {
  if (!EXPLORE.enabled) return 0;
  const clicks = ctr.byDeal?.[slug] || 0;
  const n = Math.max(1, clicks);
  const t = Math.max(1, totalClicks || 1);
  const ucb = Math.sqrt((Math.log(t + 1) / n)) * EXPLORE.ucbK; // rises for under-explored deals
  const eps = Math.random() * EXPLORE.epsilon;
  return Math.min(1, ucb + eps); // bounded
}

// ---------- Public: rankDeals ----------
export function rankDeals(deals = [], category = "software", opts = {}) {
  const ctr = loadJsonSafe(CTR_PATH, { totalClicks: 0, byDeal: {}, recent: [] });
  const ctrIndex = buildCtrIndex(ctr);

  const fresh = inferFreshnessISO(category);

  const scored = deals.map((d) => {
    const slug =
      d.slug ||
      d.url?.match(/products\/([^/]+)/)?.[1] ||
      crypto.createHash("sha1").update(d.title || String(Math.random())).digest("hex").slice(0, 8);

    const title = d.title || slug;
    const toks = tokenize(title + " " + (d.url || ""));
    const phrases = ngrams(toks, MAX_KEYWORD_LEN);

    const sCtr  = decayedCtrScore(slug, ctrIndex, ctr.recent || []);      // 0..1
    const sSem  = semanticMatch(category, title);                          // 0.25..1
    const sTail = rarityScore(phrases);                                    // 0..1
    const sFresh= fresh;                                                   // 0.1..1

    const explore = explorationBoost(slug, ctr, ctr.totalClicks || 0);     // 0..~1

    // Weighted blend
    let score =
      (sCtr    * WEIGHTS.ctr) +
      (sSem    * WEIGHTS.semantic) +
      (sTail   * WEIGHTS.longTail) +
      (sFresh  * WEIGHTS.freshness);

    // Explore–Exploit overlay (small)
    score = Math.min(1, score * (1 + explore * 0.12));

    return {
      slug,
      score,
      reasons: {
        ctr: +sCtr.toFixed(3),
        semantic: +sSem.toFixed(3),
        longTail: +sTail.toFixed(3),
        freshness: +sFresh.toFixed(3),
        explore: +explore.toFixed(3),
      },
      deal: d,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return scored.map(s => s.deal);
}

// ---------- Optional debug helper ----------
export function debugRank(deals = [], category = "software", top = 10) {
  const ctr = loadJsonSafe(CTR_PATH, { totalClicks: 0, byDeal: {}, recent: [] });
  const ctrIndex = buildCtrIndex(ctr);
  const fresh = inferFreshnessISO(category);

  const rows = deals.map((d) => {
    const slug =
      d.slug ||
      d.url?.match(/products\/([^/]+)/)?.[1] ||
      crypto.createHash("sha1").update(d.title || String(Math.random())).digest("hex").slice(0, 8);
    const title = d.title || slug;
    const toks = tokenize(title + " " + (d.url || ""));
    const phrases = ngrams(toks, MAX_KEYWORD_LEN);

    const sCtr  = decayedCtrScore(slug, ctrIndex, ctr.recent || []);
    const sSem  = semanticMatch(category, title);
    const sTail = rarityScore(phrases);
    const sFresh= fresh;
    const explore = explorationBoost(slug, ctr, ctr.totalClicks || 0);

    let score =
      (sCtr    * WEIGHTS.ctr) +
      (sSem    * WEIGHTS.semantic) +
      (sTail   * WEIGHTS.longTail) +
      (sFresh  * WEIGHTS.freshness);
    score = Math.min(1, score * (1 + explore * 0.12));

    return {
      slug,
      title,
      score: +score.toFixed(4),
      ctr: +sCtr.toFixed(3),
      semantic: +sSem.toFixed(3),
      longTail: +sTail.toFixed(3),
      freshness: +sFresh.toFixed(3),
      explore: +explore.toFixed(3),
    };
  });

  rows.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return rows.slice(0, top);
}

// ---------- Deterministic helper (optional) ----------
export function stableHash(str = "") {
  return crypto.createHash("sha1").update(str).digest("hex").slice(0, 8);
}

export default { rankDeals, debugRank };
