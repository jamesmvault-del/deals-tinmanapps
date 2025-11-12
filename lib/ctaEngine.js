// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v9.0
// “Deterministic • No-Metadata • Two-Sentence SEO • Global Dedup • White-Space SEO”
// -------------------------------------------------------------------------------------------
// Major upgrades vs v8.0
// • Two-sentence subtitle model (Option B) — Benefit + White-space keyword + Context
// • Expanded semantic clusters per category for long-tail SEO coverage
// • Smarter CTA diversification (no repeats, natural tone)
// • Full 160-char enforcement, grammar-clean, title-deduped
// • Still deterministic, regen-safe, and compatible with master-cron / updateFeed
// -------------------------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const MEMORY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// -------------------------------------------------------------------------------------------
// CTA TEMPLATES — diversified and outcome-driven
// -------------------------------------------------------------------------------------------
const CTA_TEMPLATES = {
  ai: [
    "Ship smarter AI workflows →",
    "Automate repetitive logic →",
    "Scale reliable AI pipelines →",
    "Build agentic features faster →",
    "Deploy intelligent models safely →",
  ],
  marketing: [
    "Tighten your campaign flow →",
    "Lift conversion rates →",
    "Clarify your funnel steps →",
    "Optimise ad performance →",
    "Grow your audience predictably →",
  ],
  productivity: [
    "Streamline daily tasks →",
    "Simplify your routine →",
    "Close loops on projects →",
    "Make work feel lighter →",
    "Bring order to chaos →",
  ],
  software: [
    "Stabilise your release flow →",
    "Automate platform chores →",
    "Ship with fewer bugs →",
    "Simplify deployment steps →",
    "Refine your dev rhythm →",
  ],
  courses: [
    "Turn lessons into progress →",
    "Learn faster with structure →",
    "Stay accountable to your goals →",
    "Finish what you start →",
    "Upgrade your skills practically →",
  ],
  business: [
    "Tighten team alignment →",
    "Build smoother operations →",
    "Make goals actually happen →",
    "Reduce process drag →",
    "Strengthen execution habits →",
  ],
  web: [
    "Ship cleaner web builds →",
    "Make deploys predictable →",
    "Speed up component work →",
    "Polish your UI flow →",
    "Simplify site maintenance →",
  ],
  ecommerce: [
    "Remove checkout friction →",
    "Grow repeat purchases →",
    "Tidy your product ops →",
    "Boost store performance →",
    "Clarify offer flow →",
  ],
  creative: [
    "Ship on-brand assets faster →",
    "Shorten review loops →",
    "Tidy your design system →",
    "Streamline creative hand-offs →",
    "Make briefs produce better work →",
  ],
};

// -------------------------------------------------------------------------------------------
// MEMORY for global deduplication
// -------------------------------------------------------------------------------------------
function loadMemory() {
  try {
    const raw = fs.readFileSync(MEMORY_FILE, "utf8");
    const json = JSON.parse(raw);
    return {
      usedCtas: new Set(json.usedCtas || []),
      usedSubs: new Set(json.usedSubs || []),
    };
  } catch {
    return { usedCtas: new Set(), usedSubs: new Set() };
  }
}

function saveMemory(mem) {
  try {
    fs.writeFileSync(
      MEMORY_FILE,
      JSON.stringify(
        { usedCtas: [...mem.usedCtas], usedSubs: [...mem.usedSubs] },
        null,
        2
      ),
      "utf8"
    );
  } catch {}
}

// -------------------------------------------------------------------------------------------
// UTILS
// -------------------------------------------------------------------------------------------
function sha(seed) {
  return crypto.createHash("sha1").update(String(seed)).digest("hex");
}
function pickIndex(seed, len) {
  return parseInt(sha(seed).slice(0, 8), 16) % len;
}
function sanitizeText(t = "") {
  return String(t || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/[–—]/g, " ")
    .replace(/\boptimization\b/gi, "optimisation")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
function dedupeTitle(text, title) {
  if (!text || !title) return text;
  const low = title.toLowerCase();
  return text
    .split(/\s+/)
    .filter((w) => !low.includes(w.toLowerCase()))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function clampCTA(t, n = 48) {
  if (!t) return "";
  if (t.length <= n) return t.trim();
  const cut = t.slice(0, n).replace(/\s+\S*$/, "");
  return cut.endsWith("→") ? cut : `${cut}…`;
}
function clampSub(t, n = 160) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t.trim();
  const cut = t.lastIndexOf(" ", n);
  return (cut > 40 ? t.slice(0, cut) : t.slice(0, n)).trim() + "…";
}

// -------------------------------------------------------------------------------------------
// SEMANTIC CLUSTERS (white-space SEO phrases per category)
// -------------------------------------------------------------------------------------------
const CLUSTERS = {
  ai: [
    "agentic workflows",
    "data-label clarity",
    "model evaluation habits",
    "prompt iteration loops",
    "AI deployment hygiene",
    "low-friction inference",
  ],
  marketing: [
    "micro-conversion uplift",
    "audience intent mapping",
    "offer sequencing clarity",
    "low-competition keywords",
    "creative-testing cadence",
    "funnel breakpoints",
  ],
  productivity: [
    "context-switch stability",
    "repeatable task design",
    "focus-preserving habits",
    "light-touch automation",
    "workflow momentum",
  ],
  software: [
    "release hygiene",
    "deployment discipline",
    "runtime predictability",
    "version control habits",
    "technical debt reduction",
  ],
  courses: [
    "checkpoint-led learning",
    "skill-transfer patterns",
    "tutor-guided progress",
    "structured mastery paths",
  ],
  business: [
    "execution scorecards",
    "alignment metrics",
    "operating cadence",
    "strategy clarity loops",
    "decision hygiene",
  ],
  web: [
    "component-driven velocity",
    "semantic layout balance",
    "deploy-ready assets",
    "build-to-launch clarity",
  ],
  ecommerce: [
    "checkout friction mapping",
    "offer sequencing insights",
    "catalog flow hygiene",
    "conversion-path clarity",
  ],
  creative: [
    "visual cohesion",
    "editorial polish",
    "brand-asset flow",
    "creative review loops",
    "content rhythm clarity",
  ],
};

// -------------------------------------------------------------------------------------------
// SUBTITLE BUILDER (Option B: two sentences)
// -------------------------------------------------------------------------------------------
function buildSubtitle({ category, seed, title }) {
  const c = CLUSTERS[category] ? category : "software";
  const s1Bank = {
    ai: [
      "Improves AI workflow reliability",
      "Makes model development smoother",
      "Brings predictability to AI delivery",
    ],
    marketing: [
      "Clarifies marketing workflows",
      "Improves funnel visibility",
      "Sharpens campaign decisions",
    ],
    productivity: [
      "Simplifies everyday execution",
      "Keeps teams focused on priorities",
      "Removes friction from daily tasks",
    ],
    software: [
      "Improves software release stability",
      "Keeps deployments predictable",
      "Reduces platform maintenance noise",
    ],
    courses: [
      "Turns structured learning into progress",
      "Keeps study momentum high",
      "Simplifies path-to-skill building",
    ],
    business: [
      "Strengthens operational discipline",
      "Improves cross-team alignment",
      "Keeps execution focused and calm",
    ],
    web: [
      "Improves web-build reliability",
      "Makes deployments cleaner",
      "Keeps site updates predictable",
    ],
    ecommerce: [
      "Enhances store performance clarity",
      "Improves customer checkout flow",
      "Keeps ecommerce ops consistent",
    ],
    creative: [
      "Simplifies creative delivery",
      "Keeps brand assets consistent",
      "Improves design-to-approval flow",
    ],
  }[c];

  const s1 = s1Bank[pickIndex(seed + "::s1", s1Bank.length)];
  const kw = CLUSTERS[c][pickIndex(seed + "::kw", CLUSTERS[c].length)];
  const s2Templates = [
    `Focuses on ${kw} for measurable gains.`,
    `Centres on ${kw} that lift results fast.`,
    `Uses ${kw} to expose growth gaps early.`,
    `Applies ${kw} to sharpen long-term consistency.`,
  ];
  const s2 = s2Templates[pickIndex(seed + "::s2", s2Templates.length)];

  let out = `${s1}. ${s2}`;
  out = sanitizeText(out);
  out = dedupeTitle(out, title);
  out = clampSub(out);
  return out;
}

// -------------------------------------------------------------------------------------------
// CTA ENGINE
// -------------------------------------------------------------------------------------------
export function createCtaEngine() {
  const mem = loadMemory();

  return {
    generate({ title = "", cat = "software", slug = "" }) {
      const c = CTA_TEMPLATES[cat] ? cat : "software";
      const seed = slug || title || "x";
      const tpl = CTA_TEMPLATES[c];

      let cta = tpl[pickIndex(seed, tpl.length)];
      cta = sanitizeText(cta);
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      if (mem.usedCtas.has(cta)) {
        const alt = tpl[(pickIndex(seed, tpl.length) + 1) % tpl.length];
        cta = sanitizeText(alt);
        cta = clampCTA(cta);
      }

      mem.usedCtas.add(cta);
      saveMemory(mem);
      return cta;
    },

    generateSubtitle({ title = "", category = "software", slug = "" }) {
      const c = category || "software";
      const seed = slug || title || "x";
      let sub = buildSubtitle({ category: c, seed, title });

      if (mem.usedSubs.has(sub)) {
        const altSeed = seed + "::alt";
        sub = buildSubtitle({ category: c, seed: altSeed, title });
      }

      mem.usedSubs.add(sub);
      saveMemory(mem);
      return sub;
    },
  };
}

// -------------------------------------------------------------------------------------------
// ENRICH DEALS
// -------------------------------------------------------------------------------------------
export function enrichDeals(deals = []) {
  const engine = createCtaEngine();

  return deals.map((d) => {
    const prev = d.seo || {};
    const cat = (d.category || "software").toLowerCase();
    const title = d.title || "";
    const slug =
      d.slug ||
      sanitizeText(title)
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

    const cta =
      prev.cta && prev.cta.trim()
        ? prev.cta
        : engine.generate({ title, cat, slug });

    const subtitle =
      prev.subtitle && prev.subtitle.trim()
        ? prev.subtitle
        : engine.generateSubtitle({ title, category: cat, slug });

    return { ...d, seo: { ...prev, cta, subtitle } };
  });
}

export default { createCtaEngine, enrichDeals, sanitizeText };
