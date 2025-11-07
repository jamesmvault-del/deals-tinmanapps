// /lib/ctaEvolver.js
// ♻️ TinmanApps CTA Evolution Engine v1.2
// “Keyword Momentum + Semantic Diversifier”
// Learns from CTR data, clones top performers, and injects SEO-safe semantic diversity.

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const CTR_PATH = path.join(DATA_DIR, "ctr-insights.json");
const PHRASES_PATH = path.join(DATA_DIR, "cta-phrases.json");

const STARTER_PHRASES = [
  "Discover smarter ways to grow →",
  "Streamline your workflow today →",
  "Unlock your next breakthrough →",
  "Save hours every week →",
  "Turn ideas into results →"
];

// ---------- Helpers ----------
function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function computeScores(ctr) {
  const scores = {};
  for (const [deal, clicks] of Object.entries(ctr.byDeal || {})) {
    const score = Math.log1p(clicks);
    scores[deal] = Number.isFinite(score) ? score : 0;
  }
  return scores;
}

// ---------- Synonym + semantic helpers ----------
const SYNONYMS = {
  grow: ["expand", "scale", "accelerate growth", "gain momentum"],
  workflow: ["operations", "processes", "tasks", "systems"],
  productivity: ["output", "performance", "efficiency", "focus"],
  business: ["brand", "venture", "startup", "agency"],
  marketing: ["promotion", "visibility", "reach", "conversion"],
  ai: ["automation", "intelligence", "machine learning", "smart tools"],
  learning: ["education", "training", "skill-building", "knowledge"]
};

function synonymize(phrase) {
  let output = phrase;
  for (const [key, pool] of Object.entries(SYNONYMS)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(output)) {
      const repl = pool[Math.floor(Math.random() * pool.length)];
      output = output.replace(new RegExp(`\\b${key}\\b`, "i"), repl);
    }
  }
  return output;
}

// ---------- Category-specific context ----------
const CONTEXT = {
  software: ["save time", "simplify ops", "streamline processes"],
  marketing: ["boost engagement", "capture leads", "increase reach"],
  productivity: ["work smarter", "stay focused", "get more done"],
  ai: ["automate workflows", "build with AI", "leverage automation"],
  courses: ["learn faster", "gain mastery", "apply new skills"]
};

const ACTIONS = ["Boost", "Unlock", "Enhance", "Transform", "Streamline", "Supercharge", "Elevate"];
const CLOSERS = ["today →", "instantly →", "now →", "in minutes →", "without hassle →"];

function mutatePhrase(seed, category = "software") {
  const a = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const ctx = CONTEXT[category] || CONTEXT.software;
  const mid = ctx[Math.floor(Math.random() * ctx.length)];
  const c = CLOSERS[Math.floor(Math.random() * CLOSERS.length)];
  let phrase = `${a} ${mid} ${c}`;
  phrase = synonymize(phrase);
  phrase = phrase.replace(/\s+/g, " ").trim();
  return phrase;
}

// ---------- Evolver ----------
export function evolveCTAs() {
  const ctr = loadJson(CTR_PATH, { byDeal: {}, momentum: {} });
  const phrases = loadJson(PHRASES_PATH, { history: [], active: STARTER_PHRASES });

  const scores = computeScores(ctr);
  const momentum = ctr.momentum || {};

  // Rank by weighted momentum
  const ranked = Object.entries(scores)
    .map(([deal, score]) => [deal, score + (momentum[deal]?.delta || 0)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const newPhrases = [];
  for (const [deal] of ranked) {
    const catGuess =
      /ai/i.test(deal)
        ? "ai"
        : /course|learn|academy|training/i.test(deal)
        ? "courses"
        : /market|sales|ad/i.test(deal)
        ? "marketing"
        : /productivity|task|manage/i.test(deal)
        ? "productivity"
        : "software";
    const seed = deal.replace(/-/g, " ");
    const mutated = mutatePhrase(seed, catGuess);
    if (mutated && !phrases.active.includes(mutated)) newPhrases.push(mutated);
  }

  // Merge + trim
  const merged = Array.from(
    new Set([...phrases.active, ...(newPhrases.length ? newPhrases : STARTER_PHRASES)])
  ).slice(-100);

  const updated = {
    active: merged,
    history: phrases.history.concat(newPhrases).slice(-300),
    lastEvolution: new Date().toISOString(),
    added: newPhrases.length,
  };

  writeJson(PHRASES_PATH, updated);

  console.log(
    `🧠 CTA Evolver v1.2 → ${newPhrases.length} new diversified phrases saved. (${merged.length} total active)`
  );

  return updated;
}
