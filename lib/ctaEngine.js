// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v3.3 “Meaning-First Resonance”
// ───────────────────────────────────────────────────────────────────────────────
// Major upgrade:
// • Introduces context-aware semantic templates (ensures natural phrasing)
// • No more grammatically broken CTAs ("Amplify with seamlessly →")
// • Category-anchored action phrases: AI → "Build AI workflows →", etc.
// • Subtitles now use product title + category context for clarity
// • Keeps full CTR logic, tone, and adaptive learning hooks
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

// ─────────────── Category Action Templates ───────────────
// ensures CTAs always have logical objects
const CTA_TEMPLATES = {
  ai: [
    "Build AI workflows →",
    "Automate smarter with AI →",
    "Amplify content creation →",
    "Leverage automation →",
    "Generate ideas faster →",
  ],
  marketing: [
    "Boost campaign performance →",
    "Grow your audience →",
    "Convert more leads →",
    "Enhance marketing automation →",
  ],
  productivity: [
    "Organize your workflow →",
    "Focus and get more done →",
    "Streamline daily tasks →",
    "Reclaim your time →",
  ],
  software: [
    "Simplify your operations →",
    "Automate repetitive tasks →",
    "Unlock faster workflows →",
  ],
  courses: [
    "Learn new skills today →",
    "Master your craft →",
    "Level up your knowledge →",
  ],
  business: [
    "Scale your operations →",
    "Optimize your systems →",
    "Run your business smarter →",
  ],
  web: [
    "Build stunning websites →",
    "Launch your next project →",
    "Design beautifully →",
  ],
  ecommerce: [
    "Grow your online store →",
    "Boost sales performance →",
    "Simplify checkout experience →",
  ],
  creative: [
    "Create stunning visuals →",
    "Inspire your audience →",
    "Bring your ideas to life →",
  ],
};

// ─────────────── Subtitle Templates ───────────────
const SUB_TEMPLATES = {
  ai: [
    "lets you automate and amplify with precision.",
    "helps you work smarter with AI-driven tools.",
    "transforms manual work into intelligent automation.",
  ],
  marketing: [
    "helps you grow your reach and conversions.",
    "simplifies your marketing and analytics.",
    "turns leads into loyal customers.",
  ],
  productivity: [
    "keeps you organized, focused, and efficient.",
    "helps you complete tasks effortlessly.",
    "turns time into momentum.",
  ],
  software: [
    "helps you simplify and automate everyday tasks.",
    "streamlines complex workflows seamlessly.",
  ],
  courses: [
    "guides you through learning and application.",
    "makes skill-building fast and easy.",
  ],
  business: [
    "simplifies management and growth.",
    "helps teams collaborate and scale confidently.",
  ],
  web: [
    "helps you design, build, and launch faster.",
    "makes web creation effortless.",
  ],
  ecommerce: [
    "boosts online conversions with ease.",
    "helps you sell smarter and faster.",
  ],
  creative: [
    "inspires new ideas and beautiful results.",
    "simplifies design and creative workflow.",
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
      const base = CTA_TEMPLATES[cluster] || CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;

      // CTR bias
      const bias = (ctr.byCategory?.[cluster] || 0) % base.length;
      let cta = base[bias] || pick(base);

      // Occasionally inject a semantic variation (verb swap)
      if (Math.random() < 0.25) {
        const verb = pickSemanticVariation(cluster, "verbs");
        if (verb) cta = cta.replace(/^[A-Z][a-z]+/, verb.charAt(0).toUpperCase() + verb.slice(1));
      }

      // Avoid duplicates in same crawl
      let tries = 0;
      while (used.has(cta) && tries < base.length) {
        cta = pick(base);
        tries++;
      }
      used.add(cta);

      // Mild emotional lift
      const emotional = ["faster", "smarter", "seamlessly", "confidently"];
      if (Math.random() < 0.2) {
        const adv = pick(emotional);
        if (!cta.toLowerCase().includes(adv))
          cta = cta.replace(/ →$/, ` ${adv} →`);
      }

      return clamp(dedupe(cta, title), 34);
    },

    generateSubtitle({ title = "", category = "software" }) {
      const cluster = detectCluster(title) || category;
      const base = SUB_TEMPLATES[cluster] || SUB_TEMPLATES[category] || SUB_TEMPLATES.software;
      let subtitle = pick(base);

      // Add tone bias if detected
      const tone = getToneDescriptor(cluster);
      if (tone?.tone && Math.random() < 0.3)
        subtitle = subtitle.replace(/\.$/, ` ${tone.tone.toLowerCase()}ly.`);

      // Light adverb trigger injection
      const triggers = ["instantly.", "with ease.", "without hassle.", "seamlessly."];
      if (Math.random() < 0.25) subtitle = subtitle.replace(/\.$/, " " + pick(triggers));

      return clampSubtitle(dedupe(subtitle, title), 80);
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
