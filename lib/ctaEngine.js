// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v3.2 “Tone-Aligned Resonance”
// ───────────────────────────────────────────────────────────────────────────────
// Upgrades from v3.1:
// • Smart tone placement — avoids awkward phrases like “Amplify with seamlessly →”
// • Context-aware adverb injection (verb/adjective placement logic)
// • Minor semanticCluster safety guards (no undefined tone)
// • Keeps full CTR resonance + semantic enrichment
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";
import {
  detectCluster,
  getToneDescriptor,
  pickSemanticVariation,
} from "./semanticCluster.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");

// ─────────────── Utilities ───────────────
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

function clampSubtitle(text, max = 80) {
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

// ─────────────── Base CTA / Subtitle archetypes ───────────────
const CTA_ARCHETYPES = {
  software: ["Streamline operations →", "Simplify your workflow →", "Automate smarter →"],
  marketing: ["Boost engagement →", "Unlock your next win →", "Grow conversions fast →"],
  productivity: ["Get more done →", "Work smarter today →", "Reclaim your focus →"],
  ai: ["Amplify with AI →", "Build with AI →", "Leverage automation →"],
  courses: ["Learn faster →", "Master new skills →", "Start learning today →"],
  business: ["Scale smarter →", "Optimize your systems →", "Simplify management →"],
  web: ["Design beautifully →", "Build faster →", "Launch confidently →"],
  ecommerce: ["Sell smarter →", "Boost online sales →", "Grow your shop →"],
  creative: ["Inspire your audience →", "Create boldly →", "Bring ideas to life →"],
};

const SUB_SETS = {
  software: [
    "helps you simplify everyday tasks.",
    "automates your processes for growth.",
    "turns complexity into clarity.",
  ],
  marketing: [
    "helps you grow your audience and visibility.",
    "turns leads into loyal fans.",
    "boosts engagement automatically.",
  ],
  productivity: [
    "keeps you organized and focused.",
    "turns tasks into progress effortlessly.",
    "helps you stay productive longer.",
  ],
  ai: [
    "helps you leverage AI smarter.",
    "automates creativity with precision.",
    "turns automation into advantage.",
  ],
  courses: [
    "helps you master new skills faster.",
    "guides you through learning with ease.",
    "turns lessons into real progress.",
  ],
  business: [
    "helps you scale profitably and confidently.",
    "simplifies management for growing teams.",
    "transforms operations into opportunity.",
  ],
  web: [
    "helps you design faster and smarter.",
    "makes launching effortless.",
    "turns ideas into polished websites.",
  ],
  ecommerce: [
    "helps you increase online sales.",
    "makes your store perform better.",
    "drives conversions effortlessly.",
  ],
  creative: [
    "helps you bring ideas to life.",
    "inspires bold, beautiful creation.",
    "simplifies your creative process.",
  ],
};

// ─────────────── Engine ───────────────
export function createCtaEngine() {
  const ctr = loadCTR();
  const used = new Set();

  return {
    generate({ title = "", slug = "", cat = "software" }) {
      const cluster = detectCluster(title) || cat;
      const tone = getToneDescriptor(cluster) || {};
      const base = CTA_ARCHETYPES[cluster] || CTA_ARCHETYPES[cat] || CTA_ARCHETYPES.software;

      const bias = (ctr.byCategory?.[cluster] || 0) % base.length;
      let cta = base[bias] || pick(base);

      // inject tone-based semantic variation
      if (Math.random() < 0.45) {
        const verb = pickSemanticVariation(cluster, "verbs");
        const adj = pickSemanticVariation(cluster, "adjectives");
        if (verb && adj) {
          cta = `${verb.charAt(0).toUpperCase() + verb.slice(1)} ${adj} →`;
        }
      }

      // avoid duplicates
      let tries = 0;
      while (used.has(cta) && tries < base.length) {
        cta = pick(base);
        tries++;
      }
      used.add(cta);

      // context-aware emotional flourish
      const emotional = ["confidently", "seamlessly", "faster", "smarter"];
      if (Math.random() < 0.2) {
        const adv = pick(emotional);
        // If CTA ends with "with", insert adverb properly
        if (/with\s*→$/i.test(cta)) {
          cta = cta.replace(/with\s*→$/i, `with ${adv} →`);
        } else if (/\b(build|amplify|boost|leverage|create)\b/i.test(cta)) {
          cta = cta.replace(/ →$/, ` ${adv} →`);
        }
      }

      return clamp(dedupe(cta, title), 34);
    },

    generateSubtitle({ title = "", category = "software" }) {
      const cluster = detectCluster(title) || category;
      const tone = getToneDescriptor(cluster) || {};
      const set = SUB_SETS[cluster] || SUB_SETS[category] || SUB_SETS.software;
      let base = pick(set);

      if (Math.random() < 0.4) {
        const adj = pickSemanticVariation(cluster, "adjectives");
        if (adj && !base.includes(adj))
          base = base.replace(/\.$/, ` ${adj}ly.`).replace(/\s+lyly\./, "ly.");
      }

      const triggers = ["instantly.", "with ease.", "without hassle.", "seamlessly."];
      if (Math.random() < 0.35) base = base.replace(/\.$/, " " + pick(triggers));

      return clampSubtitle(dedupe(base, title), 80);
    },
  };
}

// ─────────────── Enrichment Wrapper ───────────────
export function enrichDeals(deals, category = "software") {
  const engine = createCtaEngine();
  return deals.map((deal) => {
    const cta = engine.generate({ title: deal.title, slug: deal.slug, cat: category });
    const subtitle = engine.generateSubtitle({ title: deal.title, category });
    return { ...deal, seo: { ...(deal.seo || {}), cta, subtitle } };
  });
}

// ─────────────── Exports ───────────────
export default { createCtaEngine, enrichDeals };
