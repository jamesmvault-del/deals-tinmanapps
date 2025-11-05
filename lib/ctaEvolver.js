// /lib/ctaEvolver.js
// ♻️ TinmanApps CTA Evolution Engine v1.1
// Ensures cta-phrases.json is always created, even on first run

import fs from "fs";
import path from "path";

const CTR_PATH = path.resolve("./data/ctr-insights.json");
const PHRASES_PATH = path.resolve("./data/cta-phrases.json");

const STARTER_PHRASES = [
  "Discover smarter ways to grow →",
  "Streamline your workflow today →",
  "Unlock your next breakthrough →",
  "Save hours every week →",
  "Turn ideas into results →"
];

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function computeScores(ctr) {
  const scores = {};
  for (const [deal, clicks] of Object.entries(ctr.byDeal || {})) {
    scores[deal] = Math.log1p(clicks);
  }
  return scores;
}

const ACTIONS = ["Boost", "Unlock", "Enhance", "Transform", "Streamline", "Supercharge", "Elevate"];
const OBJECTS = ["your workflow", "your reach", "your results", "your strategy", "your impact", "your time"];
const CLOSERS = ["today →", "instantly →", "now →", "in minutes →"];

function mutatePhrase(seed) {
  const a = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const o = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
  const c = CLOSERS[Math.floor(Math.random() * CLOSERS.length)];
  const base = `${a} ${o} ${c}`;
  const words = seed.split(" ");
  const insert = words[Math.floor(Math.random() * words.length)] || "";
  return base.replace("→", `${insert ? " " + insert : ""} →`).replace(/\s+/g, " ");
}

export function evolveCTAs() {
  const ctr = loadJson(CTR_PATH, { byDeal: {} });
  const phrases = loadJson(PHRASES_PATH, { history: [], active: STARTER_PHRASES });

  const scores = computeScores(ctr);
  const topDeals = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([deal]) => deal);

  const newPhrases =
    topDeals.length > 0
      ? topDeals.map((slug) => mutatePhrase(slug.replace(/-/g, " ")))
      : [];

  // Always ensure file creation
  const merged = Array.from(
    new Set([...phrases.active, ...(newPhrases.length ? newPhrases : STARTER_PHRASES)])
  ).slice(-50);

  const updated = {
    active: merged,
    history: phrases.history.concat(newPhrases).slice(-200)
  };

  fs.writeFileSync(PHRASES_PATH, JSON.stringify(updated, null, 2));
  console.log(`🧠 CTA Evolver: ${newPhrases.length} new phrases generated (file saved).`);
  return updated;
}
