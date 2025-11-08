// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v3.8 “Precision Diversity+”
// ───────────────────────────────────────────────────────────────────────────────
// Upgrades over v3.7:
// • Adds category-anchored boosters for deeper semantic richness
// • Introduces Diversity Governor (disallows top frequent CTAs/subs reuse)
// • Expands subtitle psychology (authority, social proof, emotion)
// • Feed enrichment fix ready (works seamlessly with master-cron refresh)
// • Fully backward compatible with all previous builds
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import {
  detectCluster,
  getToneDescriptor,
  pickSemanticVariation,
} from "./semanticCluster.js";
import { applyLearningBias, getLearningBias } from "./learningGovernor.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");
const DIVERSITY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// ─────────────── Utilities ───────────────
function loadCTR() {
  try {
    return JSON.parse(fs.readFileSync(CTR_FILE, "utf8"));
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, recent: [] };
  }
}
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(DIVERSITY_FILE, "utf8"));
  } catch {
    return { ctas: {}, subs: {} };
  }
}
function saveMemory(mem) {
  fs.writeFileSync(DIVERSITY_FILE, JSON.stringify(mem, null, 2));
}
const clamp = (t, n = 34) =>
  !t ? "" : t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
const clampSubtitle = (t, n = 80) =>
  !t ? "" : t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function dedupeWords(text) {
  return text.replace(/\b(\w+)\s+\1\b/gi, "$1").replace(/\s{2,}/g, " ").trim();
}
function cleanPhrase(t) {
  return dedupeWords(t)
    .replace(/\b(neutral|undefined|null)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

// ─────────────── Templates & Boosters ───────────────
const CATEGORY_OBJECTS = {
  ai: ["AI workflows", "intelligent systems", "assistants", "automation"],
  marketing: ["campaigns", "funnels", "audiences", "leads"],
  productivity: ["tasks", "workflows", "projects", "routines"],
  software: ["operations", "workflows", "systems"],
  courses: ["lessons", "skills", "modules"],
  business: ["operations", "teams", "pipelines"],
  web: ["sites", "projects", "pages"],
  ecommerce: ["stores", "checkouts", "sales flows"],
  creative: ["designs", "content", "visuals"],
};

const BOOSTERS = {
  ai: ["AI-powered", "intelligent", "smart", "machine-learning"],
  marketing: ["growth-driven", "conversion-focused", "audience-ready", "brand-boosting"],
  productivity: ["time-saving", "workflow-optimized", "focus-boosting", "streamlined"],
  software: ["performance-optimized", "automation-ready", "scalable", "modular"],
  business: ["data-driven", "scalable", "team-aligned", "results-focused"],
  web: ["pixel-perfect", "design-forward", "launch-ready", "responsive"],
  ecommerce: ["conversion-optimized", "checkout-ready", "sales-boosting"],
  creative: ["design-led", "visual-impact", "idea-driven", "aesthetic"],
};

const CTA_TEMPLATES = {
  ai: [
    "Build {obj} →",
    "Automate your {obj} →",
    "Amplify creative output →",
    "Leverage AI confidently →",
  ],
  marketing: [
    "Boost your {obj} →",
    "Grow your audience →",
    "Convert more leads →",
    "Optimize {obj} →",
  ],
  productivity: [
    "Organize your {obj} →",
    "Focus and achieve more →",
    "Streamline {obj} →",
    "Reclaim your time →",
  ],
  software: [
    "Simplify {obj} →",
    "Automate repetitive work →",
    "Optimize your operations →",
  ],
  courses: [
    "Master new {obj} →",
    "Level up your skills →",
    "Learn faster today →",
  ],
  business: [
    "Scale your {obj} →",
    "Optimize systems →",
    "Run smarter operations →",
  ],
  web: [
    "Build stunning {obj} →",
    "Launch your next project →",
    "Design beautifully →",
  ],
  ecommerce: [
    "Grow your {obj} →",
    "Boost store performance →",
    "Simplify online selling →",
  ],
  creative: [
    "Create bold {obj} →",
    "Inspire your audience →",
    "Bring ideas to life →",
  ],
};

const SUB_TEMPLATES = {
  ai: [
    "turns manual work into intelligent automation.",
    "helps you build smarter, faster systems.",
    "streamlines complex workflows seamlessly.",
    "brings AI capabilities to your workflow effortlessly.",
  ],
  marketing: [
    "helps you grow and convert your audience effectively.",
    "simplifies campaign management and analytics.",
    "drives measurable results automatically.",
    "builds trust and visibility across your brand.",
  ],
  productivity: [
    "keeps you focused and efficient every day.",
    "turns busywork into streamlined progress.",
    "helps you stay organized and effective.",
    "frees up your time for deep work and growth.",
  ],
  software: [
    "simplifies operations and repetitive tasks.",
    "helps teams move faster and smarter.",
    "delivers clarity, speed, and performance.",
  ],
  courses: [
    "guides you through learning and mastery.",
    "makes skill growth effortless and engaging.",
    "empowers learners with confidence and clarity.",
  ],
  business: [
    "simplifies collaboration and scale.",
    "helps you manage and grow seamlessly.",
    "drives consistent results for every team.",
  ],
  web: [
    "lets you design, build, and launch effortlessly.",
    "turns web creation into clarity and speed.",
    "helps your brand stand out beautifully online.",
  ],
  ecommerce: [
    "boosts conversions and simplifies sales.",
    "helps you sell smarter online.",
    "creates shopping experiences that convert.",
  ],
  creative: [
    "inspires powerful ideas and visuals.",
    "streamlines your creative process beautifully.",
    "turns inspiration into execution with confidence.",
  ],
};

// ─────────────── Engine ───────────────
export function createCtaEngine() {
  const ctr = loadCTR();
  const memory = loadMemory();
  const usedCTAs = new Set();
  const usedSubs = new Set();

  function diversityCheck(type, cat, phrase) {
    const store = memory[type][cat] || [];
    const tooFrequent = store.filter((p) => p === phrase).length > 1;
    if (!memory[type][cat]) memory[type][cat] = [];
    memory[type][cat].push(phrase);
    if (memory[type][cat].length > 50) memory[type][cat].shift();
    return !tooFrequent;
  }

  return {
    generate({ title = "", slug = "", cat = "software" }) {
      const cluster = detectCluster(title) || cat;
      const baseTemplates =
        CTA_TEMPLATES[cluster] || CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;
      const objects = CATEGORY_OBJECTS[cluster] || CATEGORY_OBJECTS.software;
      const boosters = BOOSTERS[cluster] || [];

      let base = applyLearningBias(baseTemplates, cluster) || pick(baseTemplates);
      let obj = applyLearningBias(objects, cluster) || pick(objects);
      if (Math.random() < 0.35 && boosters.length)
        obj = `${pick(boosters)} ${obj}`;
      let cta = cleanPhrase(base.replace("{obj}", obj));

      if (Math.random() < 0.3) {
        const verb = pickSemanticVariation(cluster, "verbs");
        if (verb)
          cta = cta.replace(/^[A-Z][a-z]+/, verb.charAt(0).toUpperCase() + verb.slice(1));
      }

      let tries = 0;
      while ((usedCTAs.has(cta) || !diversityCheck("ctas", cluster, cta)) && tries < 10) {
        cta = cleanPhrase(pick(baseTemplates).replace("{obj}", pick(objects)));
        tries++;
      }
      usedCTAs.add(cta);

      const advs = ["confidently", "seamlessly", "faster", "smarter"];
      const tone = getLearningBias(cluster).toneBias || pick(advs);
      if (Math.random() < 0.2 && !cta.match(/\b(confidently|seamlessly|faster|smarter)\b/))
        cta = cta.replace(/ →$/, ` ${tone} →`);

      return clamp(dedupe(cleanPhrase(cta), title), 34);
    },

    generateSubtitle({ title = "", category = "software" }) {
      const cluster = detectCluster(title) || category;
      const base = SUB_TEMPLATES[cluster] || SUB_TEMPLATES[category] || SUB_TEMPLATES.software;
      let subtitle = cleanPhrase(applyLearningBias(base, cluster) || pick(base));

      const tone = getToneDescriptor(cluster);
      if (tone?.tone && Math.random() < 0.3)
        subtitle = subtitle.replace(/\.$/, ` ${tone.tone.toLowerCase()}ly.`);

      const triggers = [
        "instantly.",
        "with ease.",
        "without hassle.",
        "seamlessly.",
        "trusted by creators worldwide.",
        "so you focus on growth, not guesswork.",
        "with measurable results.",
      ];
      if (Math.random() < 0.3)
        subtitle = subtitle.replace(/\.$/, " " + pick(triggers));

      let tries = 0;
      while ((usedSubs.has(subtitle) || !diversityCheck("subs", cluster, subtitle)) && tries < 10) {
        subtitle = cleanPhrase(pick(base));
        tries++;
      }
      usedSubs.add(subtitle);

      saveMemory(memory);
      return clampSubtitle(dedupe(cleanPhrase(subtitle), title), 80);
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

export default { createCtaEngine, enrichDeals };
