// /lib/ctaEvolver.js
// ♻️ TinmanApps CTA Evolution Engine v1.0
// Analyses CTR logs and evolves new CTA candidates over time

import fs from "fs";
import path from "path";

const CTR_PATH = path.resolve("./data/ctr-insights.json");
const PHRASES_PATH = path.resolve("./data/cta-phrases.json");

// Seed templates used only when there is not enough data yet
const STARTER_PHRASES = [
  "Discover smarter ways to grow →",
  "Streamline your workflow today →",
  "Unlock your next breakthrough →",
  "Save hours every week →",
  "Turn ideas into results →"
];

// Load helpers
function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

// Simple scorer: CTR weighted by freshness
function computeScores(ctr) {
  const scores = {};
  for (const [deal, clicks] of Object.entries(ctr.byDeal || {})) {
    scores[deal] = Math.log1p(clicks); // diminishing returns
  }
  return scores;
}

// Light random word variation set
const ACTIONS = ["Boost", "Unlock", "Enhance", "Transform", "Streamline", "Supercharge", "Elevate"];
const OBJECTS = ["your workflow", "your reach", "your results", "your strategy", "your impact", "your time"];
const CLOSERS = ["today →", "instantly →", "now →", "in minutes →"];

// Generator that mutates phrasing based on CTR history
function mutatePhrase(seed) {
  const a = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const o = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
  const c = CLOSERS[Math.floor(Math.random() * CLOSERS.length)];
  const base = `${a} ${o} ${c}`;
  // blend a portion of the seed for continuity
  const words = seed.split(" ");
  const insert = words[Math.floor(Math.random() * words.length)] || "";
  return base.replace("→", `${insert ? " " + insert : ""} →`).replace(/\s+/g, " ");
}

// Core function: evolve CTAs
export function evolveCTAs() {
  const ctr = loadJson(CTR_PATH, { byDeal: {} });
  const phrases = loadJson(PHRASES_PATH, { history: [], active: STARTER_PHRASES });

  const scores = computeScores(ctr);
  const topDeals = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([deal]) => deal);

  // Use top deals as linguistic seeds
  const newPhrases = topDeals.map((slug) => mutatePhrase(slug.replace(/-/g, " ")));

  // Merge, dedupe, and limit
  const merged = Array.from(new Set([...phrases.active, ...newPhrases])).slice(-50);
  const updated = { active: merged, history: phrases.history.concat(newPhrases).slice(-200) };

  fs.writeFileSync(PHRASES_PATH, JSON.stringify(updated, null, 2));
  console.log(`🧠 CTA Evolver: ${newPhrases.length} new phrases generated.`);
  return updated;
}
