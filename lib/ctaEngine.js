// /lib/ctaEngine.js
// 🧠 TinmanApps CTA Evolution Engine v1.0
// Generates dynamic, context-aware CTAs using CTR history + archetype intent

import fs from "fs";
import path from "path";

const CTR_PATH = path.resolve("./data/ctr-insights.json");

// Base word banks per motivational stage
const VERBS = {
  curiosity: ["Discover", "Explore", "See", "Find out", "Uncover"],
  trust: ["Start", "Begin", "Experience", "Try", "Get"],
  action: ["Boost", "Grow", "Upgrade", "Achieve", "Unlock"],
  mastery: ["Master", "Level up", "Own", "Optimize", "Dominate"]
};

const OUTCOMES = {
  software: ["your workflow", "your systems", "your results"],
  marketing: ["your reach", "your campaigns", "your impact"],
  productivity: ["your focus", "your time", "your efficiency"],
  ai: ["your creative edge", "your insights", "your innovation"],
  courses: ["your skills", "your growth", "your expertise"]
};

// Safe reader
function loadCTR() {
  try {
    return JSON.parse(fs.readFileSync(CTR_PATH, "utf8"));
  } catch {
    return { byDeal: {}, recent: [] };
  }
}

// Select random item
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Determine stage based on engagement
function stageFromClicks(clicks) {
  if (clicks < 3) return "curiosity";
  if (clicks < 10) return "trust";
  if (clicks < 25) return "action";
  return "mastery";
}

// Generate CTA
export function generateCTA(slug, category) {
  const data = loadCTR();
  const clicks = data.byDeal?.[slug] || 0;
  const stage = stageFromClicks(clicks);
  const verb = pick(VERBS[stage]);
  const outcome = pick(OUTCOMES[category] || OUTCOMES.software);
  return `${verb} ${outcome} →`;
}
