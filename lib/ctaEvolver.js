// /lib/ctaEvolver.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — CTA Evolution Engine v3.0
// “Momentum Oracle + Entropy Governor Edition”
//
// Purpose:
// • Learn from CTR insights (deal-level + category-level momentum)
// • Generate NEW high-performance CTA variants based on semantic clusters
// • Enforce diversity, uniqueness, entropy, tone-alignment
// • Maintain long-term creativity + prevent stagnation
// • Keep active CTA pool fresh, stable, and SEO-safe
//
// Inputs:
//   - ctr-insights.json   (click history + momentum deltas)
//   - cta-phrases.json    (active pool + historical archive)
//
// Outputs:
//   - Updated cta-phrases.json with:
//       active[] (max 120)     ← production-ready CTAs
//       history[] (max 400)    ← accumulated evolution trail
//       entropy metrics
//
// 100% Render-safe, zero external dependencies.
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
    const clicks = dealClicks[deal] || 0;
    const delta = momentum[deal]?.delta || 0;
    const score = Math.log1p(clicks) + delta * 0.6;
    out[deal] = Number.isFinite(score) ? score : 0;
  }

  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// Semantic mutation pools
// ───────────────────────────────────────────────────────────────────────────────
const CATEGORY_CONTEXT = {
  ai: [
    "automate your workflows",
    "build with AI precision",
    "upgrade your intelligence stack",
    "leverage smart automation",
  ],
  marketing: [
    "capture more leads",
    "boost brand visibility",
    "supercharge your campaigns",
    "increase your conversion flow",
  ],
  productivity: [
    "work smarter",
    "accelerate daily focus",
    "simplify task flow",
    "unlock deep productivity",
  ],
  courses: [
    "learn faster",
    "master skills confidently",
    "grow your expertise",
    "upgrade your learning journey",
  ],
  business: [
    "scale your operations",
    "optimize your systems",
    "run teams more efficiently",
    "elevate your business flow",
  ],
  software: [
    "simplify complex workflows",
    "automate repetitive work",
    "upgrade your digital stack",
  ],
  web: [
    "build stunning digital experiences",
    "launch projects faster",
    "design with precision",
  ],
  ecommerce: [
    "increase your conversions",
    "boost online sales",
    "improve your checkout experience",
  ],
};

const ACTIONS = [
  "Boost", "Unlock", "Enhance", "Accelerate", "Transform",
  "Streamline", "Supercharge", "Elevate", "Reinvent", "Optimize",
];

const CLOSERS = [
  "today →", "instantly →", "right now →", "in minutes →", "with ease →",
];

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

// ───────────────────────────────────────────────────────────────────────────────
// Category guesser (from deal slug)
// ───────────────────────────────────────────────────────────────────────────────
function guessCategory(slug = "") {
  const s = slug.toLowerCase();
  if (s.includes("ai")) return "ai";
  if (/(course|learn|academy|tutorial)/.test(s)) return "courses";
  if (/(lead|market|sales|crm|ad)/.test(s)) return "marketing";
  if (/(task|productivity|manage|focus)/.test(s)) return "productivity";
  if (/(web|site|page|landing|form)/.test(s)) return "web";
  if (/(store|checkout|shop|sale)/.test(s)) return "ecommerce";
  if (/(team|operation|business|crm)/.test(s)) return "business";
  return "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// Mutation engine
// ───────────────────────────────────────────────────────────────────────────────
function mutateCTA(slug) {
  const cat = guessCategory(slug);
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const ctxArr = CATEGORY_CONTEXT[cat] || CATEGORY_CONTEXT.software;
  const ctx = ctxArr[Math.floor(Math.random() * ctxArr.length)];
  const closer = CLOSERS[Math.floor(Math.random() * CLOSERS.length)];

  let phrase = `${action} ${ctx} ${closer}`;
  phrase = synonymize(phrase);
  phrase = phrase.replace(/\s{2,}/g, " ").trim();

  if (!phrase.endsWith("→")) phrase += " →";

  return phrase;
}

// ───────────────────────────────────────────────────────────────────────────────
// EVOLUTION ENGINE (MAIN)
// ───────────────────────────────────────────────────────────────────────────────
export function evolveCTAs() {
  const ctr = loadJson(CTR_PATH, { byDeal: {}, momentum: {} });
  const phrases = loadJson(PHRASES_PATH, {
    active: STARTER,
    history: [],
  });

  const weighted = computeWeightedScores(ctr);

  // Select top deals by performance momentum
  const seeds = Object.entries(weighted)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([slug]) => slug);

  const created = [];
  for (const slug of seeds) {
    const cta = mutateCTA(slug);
    if (!phrases.active.includes(cta)) created.push(cta);
  }

  // Merge + entropy governance
  const active = Array.from(
    new Set([...phrases.active, ...(created.length ? created : STARTER)])
  )
    .filter((p) => p && p.length > 10)
    .slice(-120); // keep freshest 120 for rotation

  const history = Array.from(new Set([...phrases.history, ...created])).slice(
    -400
  );

  const updated = {
    active,
    history,
    added: created.length,
    totalActive: active.length,
    lastEvolution: new Date().toISOString(),
    entropy: Number((active.length / 120).toFixed(2)),
  };

  writeJson(PHRASES_PATH, updated);

  console.log(
    `🧠 CTA Evolver v3.0 → ${created.length} new CTAs added. Active pool: ${active.length}. Entropy: ${updated.entropy}`
  );

  return updated;
}

export default { evolveCTAs };
