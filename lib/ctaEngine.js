// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v3.7 “Precision Diversity”
// ───────────────────────────────────────────────────────────────────────────────
// Upgrades over v3.6:
// • Removes broken phrases (“neutral”, “undefined”, “seamlessly seamlessly”)
// • Adds smart text cleaning + deduplication
// • Keeps full learningGovernor integration (CTR-weighted, adaptive bias)
// • Maintains per-page uniqueness (CTA + subtitle)
// • Fully backward compatible with all previous TinmanApps builds
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

// ─────────────── Utilities ───────────────
function loadCTR() {
  try {
    const raw = fs.readFileSync(CTR_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, recent: [] };
  }
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

// ─────────────── Templates ───────────────
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
const CTA_TEMPLATES = {
  ai: ["Build {obj} →", "Automate your {obj} →", "Amplify creative output →", "Leverage AI confidently →"],
  marketing: ["Boost your {obj} →", "Grow your audience →", "Convert more leads →", "Optimize {obj} →"],
  productivity: ["Organize your {obj} →", "Focus and achieve more →", "Streamline {obj} →", "Reclaim your time →"],
  software: ["Simplify {obj} →", "Automate repetitive work →", "Optimize your operations →"],
  courses: ["Master new {obj} →", "Level up your skills →", "Learn faster today →"],
  business: ["Scale your {obj} →", "Optimize systems →", "Run smarter operations →"],
  web: ["Build stunning {obj} →", "Launch your next project →", "Design beautifully →"],
  ecommerce: ["Grow your {obj} →", "Boost store performance →", "Simplify online selling →"],
  creative: ["Create bold {obj} →", "Inspire your audience →", "Bring ideas to life →"],
};
const SUB_TEMPLATES = {
  ai: ["turns manual work into intelligent automation.", "helps you build smarter, faster systems.", "streamlines complex workflows seamlessly."],
  marketing: ["helps you grow and convert your audience effectively.", "simplifies campaign management and analytics.", "drives measurable results automatically."],
  productivity: ["keeps you focused and efficient every day.", "turns busywork into streamlined progress.", "helps you stay organized and effective."],
  software: ["simplifies operations and repetitive tasks.", "helps teams move faster and smarter."],
  courses: ["guides you through learning and mastery.", "makes skill growth effortless and engaging."],
  business: ["simplifies collaboration and scale.", "helps you manage and grow seamlessly."],
  web: ["lets you design, build, and launch effortlessly.", "turns web creation into clarity and speed."],
  ecommerce: ["boosts conversions and simplifies sales.", "helps you sell smarter online."],
  creative: ["inspires powerful ideas and visuals.", "streamlines your creative process beautifully."],
};

// ─────────────── Engine ───────────────
export function createCtaEngine() {
  const ctr = loadCTR();
  const usedCTAs = new Set();
  const usedSubs = new Set();

  return {
    generate({ title = "", slug = "", cat = "software" }) {
      const cluster = detectCluster(title) || cat;
      const baseTemplates = CTA_TEMPLATES[cluster] || CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;
      const objects = CATEGORY_OBJECTS[cluster] || CATEGORY_OBJECTS.software;

      const base = applyLearningBias(baseTemplates, cluster) || pick(baseTemplates);
      const obj = applyLearningBias(objects, cluster) || pick(objects);
      let cta = cleanPhrase(base.replace("{obj}", obj));

      if (Math.random() < 0.3) {
        const verb = pickSemanticVariation(cluster, "verbs");
        if (verb) cta = cta.replace(/^[A-Z][a-z]+/, verb.charAt(0).toUpperCase() + verb.slice(1));
      }

      let tries = 0;
      while (usedCTAs.has(cta) && tries < 8) {
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

      const triggers = ["instantly.", "with ease.", "without hassle.", "seamlessly."];
      if (Math.random() < 0.25) subtitle = subtitle.replace(/\.$/, " " + pick(triggers));

      let tries = 0;
      while (usedSubs.has(subtitle) && tries < 8) {
        subtitle = cleanPhrase(pick(base));
        tries++;
      }
      usedSubs.add(subtitle);

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
