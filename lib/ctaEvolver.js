// /lib/ctaEvolver.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — CTA Evolution Engine v4.0
// “Balanced Momentum • Category Diversifier • Entropy Governor”
//
// Purpose:
// • Learn from CTR insights (deal-level + category-level momentum).
// • Generate NEW high-performance CTA variants from semantic category pools.
// • Enforce diversity, uniqueness, and category balance (no single-cluster spam).
// • Keep the active CTA pool fresh, stable, and SEO-safe over time.
//
// Inputs:
//   - /data/ctr-insights.json
//       { totalClicks, byDeal, byCategory, momentum?, ... }
//
//   - /data/cta-phrases.json
//       {
//         active:   [ "Boost your workflow today →", ... ],
//         history:  [ ... ],
//         ...
//       }
//
// Outputs:
//   - /data/cta-phrases.json
//       {
//         active:        [ ... up to 120 ],
//         history:       [ ... up to 400 ],
//         added:         <number>,
//         totalActive:   <number>,
//         lastEvolution: <ISO>,
//         entropy:       <0–1>,
//         categorySpread: {
//           ai: <count>,
//           marketing: <count>,
//           ...
//         }
//       }
//
// Mode v4.0 — “Balanced”:
//   • High-CTR deals get more weight, but every active category gets at least 1 shot.
//   • Category-level CTR adjusts how many new CTAs are attempted per cluster.
//   • No external dependencies, fully Render-safe.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const CTR_PATH = path.join(DATA_DIR, "ctr-insights.json");
const PHRASES_PATH = path.join(DATA_DIR, "cta-phrases.json");

// Baseline fallback if no phrases exist
const STARTER = [
  "Discover smarter ways to grow →",
  "Streamline your workflow today →",
  "Unlock your next breakthrough →",
  "Save hours every week →",
  "Turn ideas into results →",
];

// CTA endings aligned with CTA Engine / SEO Integrity
const CTA_ENDINGS = [
  "→",
  "instantly →",
  "today →",
  "in one place →",
  "for better results →",
];

// ───────────────────────────────────────────────────────────────────────────────
// Safe JSON IO
// ───────────────────────────────────────────────────────────────────────────────
function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

// ───────────────────────────────────────────────────────────────────────────────
// CTR SCORE + MOMENTUM ENGINE
// ───────────────────────────────────────────────────────────────────────────────
function computeWeightedScores(ctr) {
  const out = {};
  const dealClicks = ctr.byDeal || {};
  const momentum = ctr.momentum || {};

  for (const deal of Object.keys(dealClicks)) {
    const clicks = typeof dealClicks[deal] === "number" ? dealClicks[deal] : 0;
    const delta = typeof momentum[deal]?.delta === "number" ? momentum[deal].delta : 0;
    const score = Math.log1p(Math.max(0, clicks)) + delta * 0.6;
    out[deal] = Number.isFinite(score) ? score : 0;
  }

  return out;
}

// Category CTR weights (soft guidance, not hard limits)
function computeCategoryWeights(ctr) {
  const byCategory = ctr.byCategory || {};
  const keys = Object.keys(byCategory);
  if (!keys.length) return {};

  let total = 0;
  const raw = {};
  for (const cat of keys) {
    const clicks = typeof byCategory[cat] === "number" ? byCategory[cat] : 0;
    raw[cat] = Math.max(0, clicks);
    total += raw[cat];
  }

  if (!total) {
    // Equal weighting if no recorded clicks
    const equal = 1 / keys.length;
    const out = {};
    for (const cat of keys) out[cat] = equal;
    return out;
  }

  const out = {};
  for (const cat of keys) out[cat] = raw[cat] / total;
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// Semantic mutation pools (category context phrases)
// ───────────────────────────────────────────────────────────────────────────────
const CATEGORY_CONTEXT = {
  ai: [
    "automate your workflows",
    "build with AI precision",
    "upgrade your intelligence stack",
    "leverage smart automation",
    "connect agents and workflows",
    "turn prompts into repeatable systems",
  ],
  marketing: [
    "capture more leads",
    "boost brand visibility",
    "supercharge your campaigns",
    "increase your conversion flow",
    "scale your audience growth",
    "align content with intent",
  ],
  productivity: [
    "work smarter every day",
    "accelerate daily focus",
    "simplify task flow",
    "unlock deep productivity",
    "take control of your time",
    "remove friction from your routine",
  ],
  courses: [
    "learn faster",
    "master skills confidently",
    "grow your expertise",
    "upgrade your learning journey",
    "turn lessons into results",
    "build a repeatable learning habit",
  ],
  business: [
    "scale your operations",
    "optimize your systems",
    "run teams more efficiently",
    "elevate your business flow",
    "tighten your revenue engine",
    "turn chaos into clear processes",
  ],
  software: [
    "simplify complex workflows",
    "automate repetitive work",
    "upgrade your digital stack",
    "connect the tools you rely on",
    "turn scattered apps into a system",
  ],
  web: [
    "build stunning digital experiences",
    "launch projects faster",
    "design with precision",
    "improve your site UX",
    "ship cleaner frontends",
  ],
  ecommerce: [
    "increase your conversions",
    "boost online sales",
    "improve your checkout experience",
    "grow every cart value",
    "keep customers moving to purchase",
  ],
  creative: [
    "ship better visuals",
    "turn ideas into finished assets",
    "polish your creative output",
    "keep content on-brand",
    "design faster without losing quality",
  ],
};

const ACTIONS = [
  "Boost",
  "Unlock",
  "Enhance",
  "Accelerate",
  "Transform",
  "Streamline",
  "Supercharge",
  "Elevate",
  "Reinvent",
  "Optimize",
];

// Endings strictly aligned with CTA Engine / SEO Integrity
const CLOSERS = CTA_ENDINGS;

// Lightweight synonym engine
const SYNONYMS = {
  grow: ["scale", "expand", "gain momentum"],
  workflow: ["operations", "systems", "processes"],
  productivity: ["efficiency", "output", "performance"],
  business: ["brand", "operation", "venture"],
  learn: ["master", "advance", "gain skill"],
  automate: ["accelerate", "streamline", "power"],
};

function synonymize(phrase) {
  let out = phrase;
  for (const [key, words] of Object.entries(SYNONYMS)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(out)) {
      const repl = words[Math.floor(Math.random() * words.length)];
      out = out.replace(new RegExp(`\\b${key}\\b`, "i"), repl);
    }
  }
  return out.trim();
}

// Basic CTA hygiene checks (length + arrow, avoid junk)
function isValidCta(phrase) {
  if (!phrase) return false;
  const p = String(phrase).trim();
  if (p.length < 16 || p.length > 80) return false;
  if (!p.endsWith("→")) return false;
  if (/click here|buy now|discount|cheap|sale/i.test(p)) return false;
  return true;
}

// ───────────────────────────────────────────────────────────────────────────────
// Category guesser (from deal slug)
// ───────────────────────────────────────────────────────────────────────────────
function guessCategory(slug = "") {
  const s = slug.toLowerCase();
  if (s.includes("ai")) return "ai";
  if (/(course|learn|academy|tutorial|class|training)/.test(s)) return "courses";
  if (/(lead|market|sales|crm|ad|traffic|seo)/.test(s)) return "marketing";
  if (/(task|productivity|manage|focus|todo|kanban)/.test(s)) return "productivity";
  if (/(web|site|page|landing|form|frontend)/.test(s)) return "web";
  if (/(store|checkout|shop|sale|cart|ecommerce)/.test(s)) return "ecommerce";
  if (/(team|operation|business|agency|client)/.test(s)) return "business";
  if (/(design|creative|brand|logo|template|notion)/.test(s)) return "creative";
  return "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// Mutation engine (category-aware)
// ───────────────────────────────────────────────────────────────────────────────
function mutateCTA(slug, categoryHint = null) {
  const cat = categoryHint || guessCategory(slug);
  const action =
    ACTIONS[Math.floor(Math.random() * ACTIONS.length)] || "Boost";

  const ctxArr = CATEGORY_CONTEXT[cat] || CATEGORY_CONTEXT.software;
  const ctx = ctxArr[Math.floor(Math.random() * ctxArr.length)] ||
    "simplify your workflow";

  const closer =
    CLOSERS[Math.floor(Math.random() * CLOSERS.length)] || "→";

  let phrase = `${action} ${ctx} ${closer}`;
  phrase = synonymize(phrase);
  phrase = phrase.replace(/\s{2,}/g, " ").trim();

  // Hard guarantee: end with a valid CTA ending/arrow
  if (!phrase.endsWith("→")) {
    phrase = `${phrase.replace(/[→]+$/g, "").trim()} →`;
  }

  return phrase;
}

// ───────────────────────────────────────────────────────────────────────────────
// Category-balanced seed selection
// ───────────────────────────────────────────────────────────────────────────────
function selectSeedsBalanced(weightedScores, ctr, maxSeeds = 24) {
  const entries = Object.entries(weightedScores);
  if (!entries.length) return [];

  // Attach category guess
  const withMeta = entries.map(([slug, score]) => ({
    slug,
    score,
    category: guessCategory(slug),
  }));

  // Bucket by category
  const buckets = new Map();
  for (const row of withMeta) {
    if (!buckets.has(row.category)) buckets.set(row.category, []);
    buckets.get(row.category).push(row);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => b.score - a.score);
  }

  // CTR-weighted allocation
  const catWeights = computeCategoryWeights(ctr);
  const cats = Array.from(buckets.keys());
  const totalCats = cats.length;

  const seeds = [];
  const allocated = {};

  for (const cat of cats) {
    const bucket = buckets.get(cat) || [];
    if (!bucket.length) continue;

    const weight = catWeights[cat] ?? 1 / totalCats;
    // At least 1 per active category, more for high-CTR ones
    const rawSlots = Math.round(maxSeeds * weight);
    const slots = Math.max(1, Math.min(bucket.length, rawSlots || 1));

    allocated[cat] = slots;
    seeds.push(...bucket.slice(0, slots));
  }

  // If we overshoot, trim by score globally
  const trimmed = seeds
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSeeds);

  return { seeds: trimmed, allocated };
}

// ───────────────────────────────────────────────────────────────────────────────
// EVOLUTION ENGINE (MAIN)
// ───────────────────────────────────────────────────────────────────────────────
export function evolveCTAs() {
  const ctr = loadJson(CTR_PATH, { byDeal: {}, byCategory: {}, momentum: {} });
  const phrases = loadJson(PHRASES_PATH, {
    active: STARTER,
    history: [],
  });

  const weighted = computeWeightedScores(ctr);
  const { seeds, allocated } = selectSeedsBalanced(weighted, ctr, 24);

  const activeSet = new Set(phrases.active || []);
  const created = [];
  const categorySpread = {};

  for (const { slug, category } of seeds) {
    let attempts = 0;
    let cta = "";

    while (attempts < 4) {
      cta = mutateCTA(slug, category);
      attempts += 1;
      if (!activeSet.has(cta) && isValidCta(cta)) break;
      cta = "";
    }

    if (cta && !activeSet.has(cta)) {
      activeSet.add(cta);
      created.push(cta);
      categorySpread[category] = (categorySpread[category] || 0) + 1;
    }
  }

  // Merge + entropy governance
  const baseActive =
    Array.isArray(phrases.active) && phrases.active.length
      ? phrases.active
      : STARTER;

  const active = Array.from(new Set([...baseActive, ...created]))
    .filter((p) => p && p.length > 10)
    .slice(-120); // keep freshest 120 for rotation

  const history = Array.from(
    new Set([...(phrases.history || []), ...created])
  ).slice(-400);

  const entropy = Number((active.length / 120).toFixed(2));

  const updated = {
    active,
    history,
    added: created.length,
    totalActive: active.length,
    lastEvolution: new Date().toISOString(),
    entropy,
    categorySpread,
    allocationPlan: allocated,
  };

  writeJson(PHRASES_PATH, updated);

  const catSummary = Object.entries(categorySpread)
    .map(([cat, count]) => `${cat}:${count}`)
    .join(" | ");

  console.log(
    `🧠 CTA Evolver v4.0 → ${created.length} new CTAs added. ` +
      `Active pool: ${active.length}. Entropy: ${entropy}. ` +
      (catSummary ? `Category spread: ${catSummary}` : "No category variation.")
  );

  return updated;
}

export default { evolveCTAs };
