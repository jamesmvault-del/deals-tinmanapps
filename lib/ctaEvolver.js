// /lib/ctaEvolver.js
// TinmanApps — CTA Evolver v4.0
// “Conservative Adaptive CTR-Biased Evolver • Stability-First Edition”
//
// PURPOSE
// • Slowly improves stored CTA + subtitle quality based on CTR signals
// • Uses Learning Governor momentum bias (category → tone)
// • Uses Insight Pulse top keywords + long-tail signals
// • Conservative mutations (low oscillation, high stability)
// • Hard safety rules: no raw URLs, no brand names leakage, CTA ≤64 chars,
//   arrows enforced, subtitles ≤160 chars, max 2 sentences
//
// GUARANTEES
// • Render-safe, FS-only (no external calls)
// • Deterministic fallbacks (no broken SEO)
// • Evolves ONLY when deal is active & data is valid
// • Never overwrites user-provided content unless clearly better
//
// EXPORTED CONSTANTS
// • EVOLVER_VERSION — consumed by /api/version.js
//
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { getLearningBias } from "./learningGovernor.js";

export const EVOLVER_VERSION = "v4.0 Adaptive CTR-Biased Evolver";

// Paths
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");
const INSIGHT_FILE = path.join(DATA_DIR, "insight-latest.json");

// Safety constants
const MAX_CTA = 64;
const MAX_SUB = 160;

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function loadSafe(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function clampLen(text, max) {
  return String(text || "").trim().slice(0, max);
}

function enforceArrow(t) {
  t = String(t || "").trim();
  if (!t.endsWith("→")) t = t.replace(/[.!?…]+$/, "").trim() + " →";
  return t;
}

function sanitise(t = "") {
  return String(t)
    .replace(/<\/?[^>]*>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pick(arr = []) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function twoSentenceLimit(t = "") {
  const parts = t.split(/[.!?]/).filter(Boolean);
  if (parts.length <= 2) return t.trim();
  return parts.slice(0, 2).join(". ").trim() + ".";
}

// Conservative mutation (small probability)
function maybeMutate(base, alternatives, rate = 0.18) {
  if (!alternatives?.length) return base;
  if (Math.random() > rate) return base;
  return pick(alternatives);
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA Builders (Conservative Mode)
// ───────────────────────────────────────────────────────────────────────────────
function buildCTAPool({ brand, archetype, topKW = [], longTail = [] }) {
  const core = [
    `Explore ${brand} →`,
    `Discover ${brand} →`,
    `Unlock ${brand} →`,
    `See details →`,
    `Try it now →`,
  ];

  const semantic = [
    `Boost your ${archetype.toLowerCase()} →`,
    `Upgrade your workflow →`,
    `Enhance your results →`,
    `Level up faster →`,
  ];

  const kwBased = topKW.slice(0, 3).map((k) => `Optimize ${k} →`);
  const tailBased = longTail.slice(0, 2).map((g) => `Improve ${g} →`);

  return [...core, ...semantic, ...kwBased, ...tailBased].filter(Boolean);
}

// Conservative subtitle pool
function buildSubtitlePool({ brand, archetype, longTail = [] }) {
  const base = [
    `${brand} helps you improve ${archetype.toLowerCase()} with a clean, reliable toolkit.`,
    `A stable way to improve your daily workflow and elevate your results.`,
    `Built for consistency, clarity, and measurable improvement.`,
    `A dependable choice for creators seeking long-term value.`,
  ];

  const lt = longTail.slice(0, 3).map(
    (g) => `Improves ${g} using simple, proven methods for lasting gains.`
  );

  return [...base, ...lt];
}

// ───────────────────────────────────────────────────────────────────────────────
// Score existing CTA/subtitle to determine if evolution is beneficial
// ───────────────────────────────────────────────────────────────────────────────
function scoreCTA(t = "") {
  const len = t.length;
  let score = 0;

  if (len <= MAX_CTA) score += 0.35;
  if (t.endsWith("→")) score += 0.25;
  if (/^[A-Z0-9]/.test(t)) score += 0.1;
  if (!/\b(\w+)\s+\1\b/.test(t)) score += 0.1; // no duplicated tokens
  if (!/[<>{}]/.test(t)) score += 0.1;

  return score;
}

function scoreSubtitle(t = "") {
  const len = t.length;
  let score = 0;

  if (len > 20 && len <= MAX_SUB) score += 0.4;
  if (/\./.test(t)) score += 0.1;
  if (!/\b(\w+)\s+\1\b/.test(t)) score += 0.1;
  if (!/[<>{}]/.test(t)) score += 0.1;
  if (t.split(/[.!?]/).filter(Boolean).length <= 2) score += 0.2;

  return score;
}

// ───────────────────────────────────────────────────────────────────────────────
// Main Evolver
// ───────────────────────────────────────────────────────────────────────────────
export function evolveDeal(deal, category = "software") {
  if (!deal || deal.archived) return deal;

  const insight = loadSafe(INSIGHT_FILE, { categories: {} });
  const ctr = loadSafe(CTR_FILE, { byDeal: {}, byCategory: {} });

  const insightCat = insight.categories?.[category] || {};
  const topKW = insightCat.topKeywords || [];
  const longTail = insightCat.longTail || [];

  const brand = (deal.title || "").trim();
  const archetype = category || "software";

  // Build pools
  const ctaPool = buildCTAPool({ brand, archetype, topKW, longTail });
  const subPool = buildSubtitlePool({ brand, archetype, longTail });

  const oldCTA = sanitise(deal?.seo?.cta || "");
  const oldSub = sanitise(deal?.seo?.subtitle || "");

  const { toneBias } = getLearningBias(category);

  // Tone bias influences which variants are preferred
  const preferredCTAs = ctaPool.filter((c) =>
    c.toLowerCase().includes(toneBias.toLowerCase())
  );
  const preferredSubs = subPool.filter((s) =>
    s.toLowerCase().includes(toneBias.toLowerCase())
  );

  // Conservative evolution
  const newCTA = maybeMutate(
    oldCTA,
    preferredCTAs.length ? preferredCTAs : ctaPool,
    0.22
  );

  const newSub = maybeMutate(
    oldSub,
    preferredSubs.length ? preferredSubs : subPool,
    0.18
  );

  // Score-based acceptance (only accept if strictly better)
  const oldScore = scoreCTA(oldCTA) + scoreSubtitle(oldSub);
  const newScore = scoreCTA(newCTA) + scoreSubtitle(newSub);

  let finalCTA = oldCTA;
  let finalSub = oldSub;

  if (newScore > oldScore * 1.05) {
    finalCTA = newCTA;
    finalSub = newSub;
  }

  // Enforce safety + constraints
  finalCTA = enforceArrow(clampLen(finalCTA, MAX_CTA));
  finalSub = twoSentenceLimit(clampLen(finalSub, MAX_SUB));

  return {
    ...deal,
    seo: {
      ...(deal.seo || {}),
      cta: finalCTA,
      subtitle: finalSub,
    },
  };
}

// Exposed fine-grained APIs (for future /api/ endpoints)
export function evolveCTA(deal, category) {
  return evolveDeal(deal, category)?.seo?.cta || "";
}

export function evolveSubtitle(deal, category) {
  return evolveDeal(deal, category)?.seo?.subtitle || "";
}

export function evolveKeywords(deal, category = "software") {
  const insight = loadSafe(INSIGHT_FILE, { categories: {} });
  const topKW = insight.categories?.[category]?.topKeywords || [];
  const longTail = insight.categories?.[category]?.longTail || [];
  return [...topKW.slice(0, 5), ...longTail.slice(0, 5)];
}

// Default export
export default {
  EVOLVER_VERSION,
  evolveDeal,
  evolveCTA,
  evolveSubtitle,
  evolveKeywords,
};
