// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v3.1 “CTR-Resonance”
// ───────────────────────────────────────────────────────────────────────────────
// Upgrades:
// • Integrates /lib/semanticCluster.js (intent scoring + tone drift)
// • CTR-weighted semantic verb/adjective injection
// • Adaptive CTA & subtitle based on detected cluster tone
// • Maintains 34-char CTA clamp / 80-char subtitle clamp
// • No duplicates per crawl; fully compatible with Feed Engine v6.x
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";
import { detectCluster, getToneDescriptor, pickSemanticVariation } from "./semanticCluster.js";

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
      const cluster = detectCluster(title);
      const tone = getToneDescriptor(cluster);
      const base = CTA_ARCHETYPES[cluster] || CTA_ARCHETYPES[cat] || CTA_ARCHETYPES.software;

      // CTR bias & variation
      const bias = (ctr.byCategory?.[cluster] || 0) % base.length;
      let cta = base[bias] || pick(base);

      // inject tone variation
      if (Math.random() < 0.45) {
        const verb = pickSemanticVariation(cluster, "verbs");
        const adj = pickSemanticVariation(cluster, "adjectives");
        if (verb && adj) cta = `${verb.charAt(0).toUpperCase() + verb.slice(1)} ${adj} →`;
      }

      // avoid repetition
      let tries = 0;
      while (used.has(cta) && tries < base.length) {
        cta = pick(base);
        tries++;
      }
      used.add(cta);

      // emotional flourish
      const emotional = ["confidently", "seamlessly", "faster", "smarter"];
      if (Math.random() < 0.2)
        cta = cta.replace(/ →$/, ` ${pick(emotional)} →`);

      return clamp(dedupe(cta, title), 34);
    },

    generateSubtitle({ title = "", category = "software" }) {
      const cluster = detectCluster(title);
      const tone = getToneDescriptor(cluster);
      const set = SUB_SETS[cluster] || SUB_SETS[category] || SUB_SETS.software;
      let base = pick(set);

      // Add semantic tone bias
      if (Math.random() < 0.4) {
        const adj = pickSemanticVariation(cluster, "adjectives");
        if (adj && !base.includes(adj))
          base = base.replace(/\.$/, ` ${adj}ly.`).replace(/\s+lyly\./, "ly.");
      }

      // Add conversion triggers
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
    return {
      ...deal,
      seo: { ...(deal.seo || {}), cta, subtitle },
    };
  });
}

// ─────────────── Exports ───────────────
export default { createCtaEngine, enrichDeals };
