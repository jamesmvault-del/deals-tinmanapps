// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v11.2 “Precision-Tuned”
// “Brand-Aware • Grammar-Safe • Deterministic • Two-Sentence SEO”
// ───────────────────────────────────────────────────────────────────────────────
// Major Upgrades vs v11.1
// • Tightened grammar templates (no “with in one place / with instantly” artifacts)
// • Product-name carry-through in CTA (no over-aggressive title dedupe)
// • Stronger verb/object validation + safe fallbacks
// • Subtitle subject safety when title core is missing
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

export const CTA_ENGINE_VERSION = "11.2";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function sha(seed) {
  return crypto.createHash("sha1").update(String(seed)).digest("hex");
}

function pick(seed, arr) {
  if (!arr?.length) return "";
  return arr[parseInt(sha(seed).slice(0, 8), 16) % arr.length];
}

function sanitize(t = "") {
  return String(t || "")
    .replace(/&amp;/g, "&")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function dedupeTitle(text = "", title = "") {
  const low = String(title || "").toLowerCase();
  return String(text || "")
    .split(/\s+/)
    .filter((w) => !low.includes(w.toLowerCase()))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function clamp(t, n) {
  if (!t) return "";
  const s = String(t);
  if (s.length <= n) return s.trim();
  const cut = s.slice(0, n).replace(/\s+\S*$/, "");
  return cut.trim() + "…";
}

function titleCore(t = "") {
  return String(t || "").split(/[:\-|]/)[0].trim();
}

// ───────────────────────────────────────────────────────────────────────────────
// Category clusters (semantic bias tuning)
// ───────────────────────────────────────────────────────────────────────────────
const CLUSTERS = {
  ai: {
    verbs: ["Automate", "Simplify", "Enhance", "Optimize", "Scale", "Accelerate"],
    objects: ["AI workflow", "agent tasks", "smart automation", "prompt chains", "model outputs"],
    topics: ["workflow intelligence", "agentic reasoning", "data enrichment", "AI-driven systems"],
  },
  marketing: {
    verbs: ["Boost", "Grow", "Optimize", "Scale", "Elevate", "Drive"],
    objects: ["marketing performance", "campaigns", "brand reach", "conversion rate", "audience growth"],
    topics: ["conversion funnels", "audience intent", "creative testing", "SEO clarity"],
  },
  productivity: {
    verbs: ["Simplify", "Organize", "Streamline", "Accelerate", "Focus", "Refine"],
    objects: ["daily work", "task lists", "team output", "workflow", "routine"],
    topics: ["habit loops", "focus systems", "priority clarity", "process momentum"],
  },
  business: {
    verbs: ["Streamline", "Enhance", "Automate", "Improve", "Elevate", "Align"],
    objects: ["operations", "client management", "sales systems", "reporting", "execution"],
    topics: ["operational clarity", "team alignment", "scalable processes", "insight loops"],
  },
  courses: {
    verbs: ["Learn", "Master", "Advance", "Level-up", "Accelerate", "Develop"],
    objects: ["skills", "knowledge", "career", "expertise", "learning path"],
    topics: ["structured learning", "guided mastery", "creator education"],
  },
  web: {
    verbs: ["Build", "Launch", "Design", "Optimize", "Enhance", "Deploy"],
    objects: ["website", "landing pages", "UX", "frontend workflow", "design system"],
    topics: ["site performance", "component velocity", "semantic layout"],
  },
  ecommerce: {
    verbs: ["Increase", "Boost", "Simplify", "Optimize", "Enhance", "Grow"],
    objects: ["sales", "checkout flow", "store performance", "customer journey"],
    topics: ["conversion systems", "store optimisation", "retention loops"],
  },
  creative: {
    verbs: ["Create", "Design", "Elevate", "Refine", "Polish", "Reimagine"],
    objects: ["visuals", "content", "media", "creative assets", "brand visuals"],
    topics: ["brand cohesion", "editorial polish", "content rhythm"],
  },
  software: {
    verbs: ["Simplify", "Optimize", "Automate", "Enhance", "Improve", "Scale"],
    objects: ["workflow", "systems", "stack", "processes", "deployment"],
    topics: ["runtime efficiency", "deployment hygiene", "scalability"],
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// CTA Builder (context-validated grammar)
// ───────────────────────────────────────────────────────────────────────────────
function grammarPolishCta(ctaRaw = "") {
  let cta = String(ctaRaw || "").trim();

  // Fix broken preposition + adverb combos
  cta = cta.replace(/\bwith in one place\b/gi, "in one place");
  cta = cta.replace(/\bwith instantly\b/gi, "instantly");
  cta = cta.replace(/\bwith today\b/gi, "today");
  cta = cta.replace(/\bwith for better results\b/gi, "for better results");

  // Remove accidental duplicate "with with"
  cta = cta.replace(/\bwith with\b/gi, "with");

  // Ensure we don't end up with dangling "with"
  cta = cta.replace(/\bwith\s*→$/gi, "→");

  return cta.trim();
}

function buildCTA({ title, category, slug, runSalt = "" }) {
  const cat = CLUSTERS[category] ? category : "software";
  const brandCore = titleCore(title);
  const hasBrand = !!brandCore && brandCore.length > 1;
  const brand = hasBrand ? brandCore : "this tool";

  const verb = pick(slug + "::v", CLUSTERS[cat].verbs) || "Improve";
  const object = pick(slug + "::o", CLUSTERS[cat].objects) || "workflow";

  const endings = ["→", "instantly →", "today →", "in one place →", "for better results →"];
  const end = pick(runSalt + "::end", endings) || "→";

  let cta = "";

  // Validation logic — align verb/object/brand so no broken “with X” artifacts
  if (hasBrand && object) {
    cta = `${verb} your ${object} with ${brand} ${end}`;
  } else if (object) {
    cta = `${verb} your ${object} ${end}`;
  } else if (hasBrand) {
    cta = `${verb} with ${brand} ${end}`;
  } else {
    cta = `${verb} your workflow ${end}`;
  }

  cta = sanitize(cta);
  cta = grammarPolishCta(cta); // remove “with in one place”, “with instantly”, etc.
  return clamp(cta, 64);
}

// ───────────────────────────────────────────────────────────────────────────────
// Subtitle Builder (two-sentence, category-biased)
// ───────────────────────────────────────────────────────────────────────────────
function buildSubtitle({ title, category, slug, runSalt = "" }) {
  const cat = CLUSTERS[category] ? category : "software";
  const brandCore = titleCore(title);
  const subject = brandCore || "This tool";

  const topic = pick(slug + "::t", CLUSTERS[cat].topics) || "workflow clarity";
  const verb1 = pick(slug + "::v1", ["helps", "streamlines", "simplifies", "enhances", "improves"]) || "helps";

  const intro = `${subject} ${verb1} ${topic} with an intuitive approach.`;

  const benefits = [
    `Focuses on ${pick(slug + "::s2b", CLUSTERS[cat].topics) || "practical outcomes"} to drive measurable gains.`,
    "Helps teams save time and reduce friction across workflows.",
    "Delivers clarity and performance improvements over time.",
    "Centres on consistency and smart automation for sustained results.",
  ];
  const s2 = pick(runSalt + "::s2", benefits);

  const sub = `${intro} ${s2}`;
  return clamp(sanitize(dedupeTitle(sub, title)), 160);
}

// ───────────────────────────────────────────────────────────────────────────────
// Engine Wrapper
// ───────────────────────────────────────────────────────────────────────────────
export function createCtaEngine() {
  const usedCtas = new Set();
  const usedSubs = new Set();

  return {
    generate({ title = "", category = "software", slug = "", runSalt = "" }) {
      let cta = buildCTA({ title, category, slug, runSalt });
      let tries = 0;
      while (usedCtas.has(cta) && tries < 5) {
        cta = buildCTA({ title, category, slug: `${slug}::${tries}`, runSalt });
        tries++;
      }
      usedCtas.add(cta);
      return cta;
    },

    generateSubtitle({ title = "", category = "software", slug = "", runSalt = "" }) {
      let sub = buildSubtitle({ title, category, slug, runSalt });
      let tries = 0;
      while (usedSubs.has(sub) && tries < 5) {
        sub = buildSubtitle({ title, category, slug: `${slug}::${tries}`, runSalt });
        tries++;
      }
      usedSubs.add(sub);
      return sub;
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Enrich Deals (legacy helper; master-cron now does main regeneration)
// ───────────────────────────────────────────────────────────────────────────────
export function enrichDeals(deals = []) {
  const engine = createCtaEngine();
  const runSalt = Date.now().toString();

  return deals.map((d) => {
    const prev = d.seo || {};
    const category = (d.category || "software").toLowerCase();
    const title = sanitize(d.title || "");
    const slug =
      d.slug ||
      title
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

    const cta =
      prev.cta && prev.cta.trim()
        ? sanitize(grammarPolishCta(prev.cta))
        : engine.generate({ title, category, slug, runSalt });

    const subtitle =
      prev.subtitle && prev.subtitle.trim()
        ? sanitize(prev.subtitle)
        : engine.generateSubtitle({ title, category, slug, runSalt });

    return { ...d, seo: { ...prev, cta, subtitle } };
  });
}

export default { createCtaEngine, enrichDeals, sanitize, CTA_ENGINE_VERSION };
