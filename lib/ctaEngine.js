// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v10.1
// “Context-Aware Hybrid • Brand-Aware • Deterministic • Two-Sentence SEO”
// ───────────────────────────────────────────────────────────────────────────────
// Major Upgrades vs v10.0
// • Context-aware generation using title + description
// • Brand-injection into CTA + subtitle for semantic SEO relevance
// • Global dedupe (active-run scope)
// • Deterministic seeds (slug-based)
// • Render-safe (no async calls, no external deps)
// • Two-sentence subtitle: “What it does” + “Benefit / SEO value”
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

export const CTA_ENGINE_VERSION = "10.1";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
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
function extractKeywords(text = "", limit = 4) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && w.length < 15);
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.keys(freq)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, limit);
}

// ───────────────────────────────────────────────────────────────────────────────
// Category lexical clusters (for secondary sentence diversity)
// ───────────────────────────────────────────────────────────────────────────────
const CLUSTERS = {
  ai: ["prompt optimisation", "agentic workflows", "inference loops", "model evaluation", "deployment hygiene"],
  marketing: ["campaign flow", "audience intent", "conversion lift", "creative testing", "SEO clarity"],
  productivity: ["task automation", "workflow momentum", "habit loops", "project tracking"],
  software: ["release hygiene", "runtime predictability", "technical debt reduction", "deployment discipline"],
  courses: ["skill-transfer", "structured learning", "tutor guidance", "progress tracking"],
  business: ["operational clarity", "execution discipline", "strategy loops", "alignment metrics"],
  web: ["component velocity", "semantic layout", "design balance", "site reliability"],
  ecommerce: ["checkout friction", "offer clarity", "store performance", "customer retention"],
  creative: ["visual cohesion", "editorial polish", "content rhythm", "design consistency"],
};

// ───────────────────────────────────────────────────────────────────────────────
// Context-Aware CTA builder
// ───────────────────────────────────────────────────────────────────────────────
function buildCTA({ title, description, category, slug, runSalt = "" }) {
  const brand = title?.split(/[:-]/)[0]?.trim() || title || "This tool";
  const c = CLUSTERS[category] ? category : "software";
  const verbs = [
    "Streamline",
    "Automate",
    "Simplify",
    "Accelerate",
    "Boost",
    "Enhance",
    "Optimise",
    "Power up",
    "Grow",
  ];
  const focus = extractKeywords(description || title, 2).join(" ");
  const action = verbs[pickIndex(slug + runSalt, verbs.length)];
  const endings = [
    "→",
    "for better results →",
    "in one place →",
    "instantly →",
  ];
  const end = endings[pickIndex(runSalt + slug, endings.length)];
  let cta = `${action} your ${focus || category} with ${brand} ${end}`.trim();
  cta = sanitizeText(cta);
  cta = dedupeTitle(cta, title);
  return clampCTA(cta);
}

// ───────────────────────────────────────────────────────────────────────────────
// Context-Aware Subtitle builder (two sentences)
// ───────────────────────────────────────────────────────────────────────────────
function buildSubtitle({ title, description, category, slug, runSalt = "" }) {
  const brand = title?.split(/[:-]/)[0]?.trim() || title || "This tool";
  const c = CLUSTERS[category] ? category : "software";
  const kws = extractKeywords(description || title, 3);
  const kw = kws[pickIndex(slug + "::kw", kws.length)] || CLUSTERS[c][pickIndex(slug, CLUSTERS[c].length)];
  const actionVerbs = [
    "helps",
    "simplifies",
    "improves",
    "streamlines",
    "enhances",
    "makes it easier to",
  ];
  const act = actionVerbs[pickIndex(slug + "::v", actionVerbs.length)];
  const s1 = `${brand} ${act} ${kw} with an intuitive approach.`;
  const s2Templates = [
    `Focuses on ${CLUSTERS[c][pickIndex(slug + "::s2", CLUSTERS[c].length)]} to drive measurable gains.`,
    `Helps teams save time and reduce friction across workflows.`,
    `Delivers clarity and performance improvements over time.`,
    `Centres on consistency and smart automation for sustained results.`,
  ];
  const s2 = s2Templates[pickIndex(runSalt + "::s2" + slug, s2Templates.length)];
  let out = `${s1} ${s2}`;
  out = sanitizeText(out);
  out = dedupeTitle(out, title);
  out = clampSub(out);
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA Engine (global dedupe active-run scope)
// ───────────────────────────────────────────────────────────────────────────────
export function createCtaEngine() {
  const usedCtas = new Set();
  const usedSubs = new Set();

  return {
    generate({ title = "", description = "", cat = "software", slug = "", runSalt = "" }) {
      let cta = buildCTA({ title, description, category: cat, slug, runSalt });
      let safety = 0;
      while (usedCtas.has(cta) && safety < 5) {
        cta = buildCTA({ title, description, category: cat, slug: slug + "::alt" + safety, runSalt });
        safety++;
      }
      usedCtas.add(cta);
      return cta;
    },

    generateSubtitle({ title = "", description = "", category = "software", slug = "", runSalt = "" }) {
      let sub = buildSubtitle({ title, description, category, slug, runSalt });
      let safety = 0;
      while (usedSubs.has(sub) && safety < 5) {
        sub = buildSubtitle({ title, description, category, slug: slug + "::alt" + safety, runSalt });
        safety++;
      }
      usedSubs.add(sub);
      return sub;
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// ENRICH DEALS
// ───────────────────────────────────────────────────────────────────────────────
export function enrichDeals(deals = []) {
  const engine = createCtaEngine();
  const runSalt = Date.now().toString();

  return deals.map((d) => {
    const prev = d.seo || {};
    const cat = (d.category || "software").toLowerCase();
    const title = sanitizeText(d.title || "");
    const description = sanitizeText(d.description || "");
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
        : engine.generate({ title, description, cat, slug, runSalt });

    const subtitle =
      prev.subtitle && prev.subtitle.trim()
        ? prev.subtitle
        : engine.generateSubtitle({ title, description, category: cat, slug, runSalt });

    return { ...d, seo: { ...prev, cta, subtitle } };
  });
}

export default { createCtaEngine, enrichDeals, sanitizeText, CTA_ENGINE_VERSION };
