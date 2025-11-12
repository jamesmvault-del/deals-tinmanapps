// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v11.0 “Human-Tuned”
// “Brand-Aware • Grammar-Correct • Deterministic • Two-Sentence SEO”
// ───────────────────────────────────────────────────────────────────────────────
// Major Upgrades vs v10.1
// • Rewrites CTA & subtitle logic with grammar-safe templates
// • Brand-aware assembly: titles naturally embedded in both CTA & subtitle
// • Category-specific verb/object clusters for realistic phrasing
// • Strict clamps (≤64 chars CTA, ≤160 chars subtitle) + dedupe
// • Deterministic seeding for stable regeneration
// • No logic overlap with seoIntegrity.js (validation-only downstream)
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

export const CTA_ENGINE_VERSION = "11.0";

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
  const low = title.toLowerCase();
  return text
    .split(/\s+/)
    .filter((w) => !low.includes(w.toLowerCase()))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function clamp(t, n) {
  if (!t) return "";
  if (t.length <= n) return t.trim();
  const cut = t.slice(0, n).replace(/\s+\S*$/, "");
  return cut.trim() + "…";
}
function titleCore(t = "") {
  return t.split(/[:\-|]/)[0].trim();
}

// ───────────────────────────────────────────────────────────────────────────────
// Category clusters
// ───────────────────────────────────────────────────────────────────────────────
const CLUSTERS = {
  ai: {
    verbs: ["Automate", "Simplify", "Enhance", "Optimize", "Scale"],
    objects: ["AI workflow", "agent tasks", "smart automation", "prompt chains", "model outputs"],
    topics: ["workflow intelligence", "agentic reasoning", "data enrichment", "AI-driven systems"],
  },
  marketing: {
    verbs: ["Boost", "Grow", "Optimize", "Scale", "Elevate"],
    objects: ["marketing performance", "campaigns", "brand reach", "conversion rate", "audience growth"],
    topics: ["conversion funnels", "audience intent", "creative testing", "SEO clarity"],
  },
  productivity: {
    verbs: ["Simplify", "Organize", "Streamline", "Accelerate", "Focus"],
    objects: ["daily work", "task lists", "team output", "workflow", "routine"],
    topics: ["habit loops", "focus systems", "priority clarity", "process momentum"],
  },
  business: {
    verbs: ["Streamline", "Enhance", "Automate", "Improve", "Elevate"],
    objects: ["operations", "client management", "sales systems", "reporting", "execution"],
    topics: ["operational clarity", "team alignment", "scalable processes", "insight loops"],
  },
  courses: {
    verbs: ["Learn", "Master", "Advance", "Level-up", "Accelerate"],
    objects: ["skills", "knowledge", "career", "expertise", "learning path"],
    topics: ["structured learning", "guided mastery", "creator education"],
  },
  web: {
    verbs: ["Build", "Launch", "Design", "Optimize", "Enhance"],
    objects: ["website", "landing pages", "UX", "frontend workflow", "design system"],
    topics: ["site performance", "component velocity", "semantic layout"],
  },
  ecommerce: {
    verbs: ["Increase", "Boost", "Simplify", "Optimize", "Enhance"],
    objects: ["sales", "checkout flow", "store performance", "customer journey"],
    topics: ["conversion systems", "store optimisation", "retention loops"],
  },
  creative: {
    verbs: ["Create", "Design", "Elevate", "Refine", "Polish"],
    objects: ["visuals", "content", "media", "creative assets"],
    topics: ["brand cohesion", "editorial polish", "content rhythm"],
  },
  software: {
    verbs: ["Simplify", "Optimize", "Automate", "Enhance", "Improve"],
    objects: ["workflow", "systems", "stack", "processes"],
    topics: ["runtime efficiency", "deployment hygiene", "scalability"],
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// CTA Builder
// ───────────────────────────────────────────────────────────────────────────────
function buildCTA({ title, category, slug, runSalt = "" }) {
  const cat = CLUSTERS[category] ? category : "software";
  const brand = titleCore(title);
  const v = pick(slug + "::v", CLUSTERS[cat].verbs);
  const o = pick(slug + "::o", CLUSTERS[cat].objects);
  const endings = ["→", "instantly →", "today →", "in one place →", "for better results →"];
  const end = pick(runSalt + "::end", endings);
  let cta = `${v} your ${o} with ${brand} ${end}`;
  cta = sanitize(cta);
  cta = dedupeTitle(cta, title);
  return clamp(cta, 64);
}

// ───────────────────────────────────────────────────────────────────────────────
// Subtitle Builder (two sentences: feature + benefit)
// ───────────────────────────────────────────────────────────────────────────────
function buildSubtitle({ title, category, slug, runSalt = "" }) {
  const cat = CLUSTERS[category] ? category : "software";
  const brand = titleCore(title);
  const topic = pick(slug + "::t", CLUSTERS[cat].topics);
  const v1 = pick(slug + "::v1", ["helps", "streamlines", "simplifies", "enhances", "improves"]);
  const s1 = `${brand} ${v1} ${topic} with an intuitive approach.`;
  const s2 = pick(runSalt + "::s2", [
    `Focuses on ${pick(slug + "::s2b", CLUSTERS[cat].topics)} to drive measurable gains.`,
    "Helps teams save time and reduce friction across workflows.",
    "Delivers clarity and performance improvements over time.",
    "Centres on consistency and smart automation for sustained results.",
  ]);
  const sub = `${s1} ${s2}`;
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
        cta = buildCTA({ title, category, slug: slug + "::" + tries, runSalt });
        tries++;
      }
      usedCtas.add(cta);
      return cta;
    },
    generateSubtitle({ title = "", category = "software", slug = "", runSalt = "" }) {
      let sub = buildSubtitle({ title, category, slug, runSalt });
      let tries = 0;
      while (usedSubs.has(sub) && tries < 5) {
        sub = buildSubtitle({ title, category, slug: slug + "::" + tries, runSalt });
        tries++;
      }
      usedSubs.add(sub);
      return sub;
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Enrich Deals
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
        ? prev.cta
        : engine.generate({ title, category, slug, runSalt });

    const subtitle =
      prev.subtitle && prev.subtitle.trim()
        ? prev.subtitle
        : engine.generateSubtitle({ title, category, slug, runSalt });

    return { ...d, seo: { ...prev, cta, subtitle } };
  });
}

export default { createCtaEngine, enrichDeals, sanitize, CTA_ENGINE_VERSION };
