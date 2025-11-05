// /lib/ctaEngine.js
// 🎯 TinmanApps Dynamic CTA Engine v2.0
// Pulls live CTAs from evolving cta-phrases.json with adaptive logic

import fs from "fs";
import path from "path";

// ✅ File path reference
const PHRASES_PATH = path.resolve("./data/cta-phrases.json");

// ✅ Fallback starter CTAs
const STARTER_CTAS = [
  "Discover smarter ways to grow →",
  "Streamline your workflow today →",
  "Unlock your next breakthrough →",
  "Save hours every week →",
  "Turn ideas into results →"
];

// ✅ Load latest CTA pool
function loadCTAs() {
  try {
    const data = JSON.parse(fs.readFileSync(PHRASES_PATH, "utf8"));
    const active = Array.isArray(data.active) && data.active.length
      ? data.active
      : STARTER_CTAS;
    return active;
  } catch {
    return STARTER_CTAS;
  }
}

// ✅ Weighted random selection favouring newer CTAs
export function getAdaptiveCTA(indexHint = 0) {
  const phrases = loadCTAs();
  const now = Date.now();

  // Use index hint to keep some consistency per page load
  const base = indexHint % phrases.length;
  const variance = Math.floor((now / 60000) % phrases.length); // rotates every minute
  const choice = phrases[(base + variance) % phrases.length];

  // ✅ Adaptive framing for variation (e.g. novelty, efficiency, authority)
  const archetypes = [
    "✨",
    "🚀",
    "💡",
    "🧠",
    "⚡",
    "🔥",
    "📈",
    "🎯"
  ];
  const prefix = archetypes[Math.floor(Math.random() * archetypes.length)];
  return `${prefix} ${choice}`;
}
