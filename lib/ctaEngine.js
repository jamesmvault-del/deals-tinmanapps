// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v2.0 “Hard-Clamp Safe + Contextual Brevity”
// ───────────────────────────────────────────────────────────────────────────────
// Features:
// • 34-char hard clamp (no overflow across UI)
// • Psychographic CTA logic (based on category archetypes)
// • Brevity + uniqueness enforcement
// • Brand-deduplication
// • Adaptive subtitles with benefit focus
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");

// ---------- Utilities ----------
function loadCTR() {
  try {
    const raw = fs.readFileSync(CTR_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, recent: [] };
  }
}

function clamp(text, max = 34) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

function dedupe(text, title = "") {
  if (!text || !title) return text;
  const normTitle = title.toLowerCase();
  return text
    .split(" ")
    .filter((w) => !normTitle.includes(w.toLowerCase()))
    .join(" ")
    .trim();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- CTA + Subtitle Context Tables ----------
const CTA_SETS = {
  software: [
    "Streamline operations →",
    "Simplify your workflow →",
    "Unlock faster growth →",
    "Save time instantly →",
    "Automate repetitive work →",
  ],
  marketing: [
    "Boost engagement →",
    "Gain more leads →",
    "Unlock your next win →",
    "Grow conversions fast →",
    "Power up visibility →",
  ],
  productivity: [
    "Work smarter today →",
    "Get more done →",
    "Stay focused longer →",
    "Unblock your output →",
    "Reclaim your time →",
  ],
  ai: [
    "Build with AI →",
    "Automate creativity →",
    "Amplify with automation →",
    "Leverage smart tools →",
    "Upgrade your workflow →",
  ],
  courses: [
    "Learn faster →",
    "Master your craft →",
    "Apply new skills →",
    "Start learning today →",
    "Level up instantly →",
  ],
};

const SUB_SETS = {
  software: [
    "helps you simplify everyday tasks.",
    "automates your processes for growth.",
    "turns complexity into clarity.",
    "helps teams move faster.",
  ],
  marketing: [
    "helps you grow your audience.",
    "turns leads into loyal fans.",
    "boosts engagement automatically.",
    "simplifies campaign management.",
  ],
  productivity: [
    "helps you stay organized and focused.",
    "keeps your work effortless and efficient.",
    "turns tasks into momentum.",
    "helps you work smarter every day.",
  ],
  ai: [
    "helps you automate creatively.",
    "lets you amplify output with AI.",
    "helps you leverage AI smarter.",
    "turns automation into advantage.",
  ],
  courses: [
    "helps you gain mastery faster.",
    "guides you to apply new skills.",
    "makes learning effortless.",
    "turns lessons into results.",
  ],
};

// ---------- Engine ----------
export function createCtaEngine() {
  const ctr = loadCTR();

  return {
    generate({ title = "", slug = "", cat = "software" }) {
      const set = CTA_SETS[cat] || CTA_SETS.software;
      let cta = pick(set);

      // Slightly evolve based on CTR bias
      const bias = (ctr.byCategory?.[cat] || 0) % set.length;
      cta = set[bias] || cta;

      // Deduplicate brand and clamp
      cta = dedupe(cta, title);
      return clamp(cta, 34);
    },

    generateSubtitle({ title = "", category = "software" }) {
      const set = SUB_SETS[category] || SUB_SETS.software;
      let base = pick(set);

      // Add psychological trigger if fits brevity
      const triggers = [
        "instantly.",
        "with ease.",
        "without hassle.",
        "seamlessly.",
      ];
      if (Math.random() < 0.3) base = base.replace(/\.$/, " " + pick(triggers));

      // Remove redundancy + enforce brevity
      base = dedupe(base, title);
      return clamp(base, 80);
    },
  };
}
