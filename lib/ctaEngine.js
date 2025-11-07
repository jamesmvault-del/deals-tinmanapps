// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v3.0 “Dynamic Bespoke Intelligence”
// ───────────────────────────────────────────────────────────────────────────────
// Upgrades:
// • Keyword-aware dynamic CTA generation (per-deal intelligence)
// • 34-char hard clamp + 80-char subtitle safety
// • Non-repeating CTAs within a category crawl
// • Emotional tone drift + semantic benefit mapping
// • Seamless Feed Engine v6.x compatibility
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

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

function hasAny(str, words) {
  const t = str.toLowerCase();
  return words.some((w) => t.includes(w));
}

// ─────────────── Context Matrices ───────────────
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

// keyword clusters → bias categories
const SEMANTIC_CLUSTERS = [
  { keys: ["ai", "automation", "agent", "gpt", "assistant"], cat: "ai" },
  { keys: ["email", "newsletter", "outreach", "crm", "leads"], cat: "marketing" },
  { keys: ["course", "academy", "lesson", "learn", "teach"], cat: "courses" },
  { keys: ["project", "task", "workflow", "focus", "time"], cat: "productivity" },
  { keys: ["shop", "store", "checkout", "ecommerce"], cat: "ecommerce" },
  { keys: ["design", "builder", "website", "theme", "no-code"], cat: "web" },
  { keys: ["team", "agency", "client", "business", "startup"], cat: "business" },
  { keys: ["creative", "video", "art", "media", "photo"], cat: "creative" },
];

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
  const used = new Set(); // to prevent duplicates in a crawl

  function detectCategory(title, fallback) {
    const text = title.toLowerCase();
    for (const c of SEMANTIC_CLUSTERS) if (hasAny(text, c.keys)) return c.cat;
    return fallback;
  }

  return {
    generate({ title = "", slug = "", cat = "software" }) {
      const dynamicCat = detectCategory(title, cat);
      const base = CTA_ARCHETYPES[dynamicCat] || CTA_ARCHETYPES.software;

      // CTR bias
      const bias = (ctr.byCategory?.[dynamicCat] || 0) % base.length;
      let cta = base[bias] || pick(base);

      // ensure no duplicates in same run
      let tries = 0;
      while (used.has(cta) && tries < base.length) {
        cta = pick(base);
        tries++;
      }
      used.add(cta);

      // micro-tone adjustment
      const emotional = ["confidently", "seamlessly", "faster", "smarter"];
      if (Math.random() < 0.25)
        cta = cta.replace(/ →$/, " " + pick(emotional) + " →");

      return clamp(dedupe(cta, title), 34);
    },

    generateSubtitle({ title = "", category = "software" }) {
      const dynamicCat = detectCategory(title, category);
      const set = SUB_SETS[dynamicCat] || SUB_SETS.software;
      let base = pick(set);

      // triggers
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
