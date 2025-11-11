// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v6.5
// “Deterministic • Category-Pure • Regen-Safe • Anti-Generic Edition”
// -----------------------------------------------------------------------------
// • Deterministic (slug-anchored SHA1) selection
// • Category-pure phrasing (no cross-contamination)
// • Hard anti-generic banlist with deterministic re-pick
// • Subtitle seam normaliser + bigram deduper
// • UK spelling normalisation
// • Object-safe CTAs (no weird longtail nouns inside CTAs)
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DIVERSITY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// ───────────────────────────────────────────────────────────────────────────────
// Memory (kept for potential future telemetry; not used for determinism)
// ───────────────────────────────────────────────────────────────────────────────
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(DIVERSITY_FILE, "utf8"));
  } catch {
    return { ctas: {}, subs: {} };
  }
}
function saveMemory(mem) {
  try {
    fs.writeFileSync(DIVERSITY_FILE, JSON.stringify(mem, null, 2), "utf8");
  } catch {}
}

// ───────────────────────────────────────────────────────────────────────────────
// Utils
// ───────────────────────────────────────────────────────────────────────────────
function sha(seed) {
  return crypto.createHash("sha1").update(seed).digest("hex");
}
function pickIndex(seed, len) {
  const h = sha(seed);
  return parseInt(h.slice(0, 8), 16) % len;
}
function hashPick(seed, arr) {
  if (!arr?.length) return "";
  return arr[pickIndex(seed, arr.length)];
}
function hashPickAvoid(seed, arr, avoidRegexes = []) {
  if (!arr?.length) return "";
  const L = arr.length;
  if (!avoidRegexes.length) return arr[pickIndex(seed, L)];

  // Deterministic step: derive stride from hash so retries are stable, not random.
  const base = pickIndex(seed, L);
  const stride = (parseInt(sha(seed + "::stride").slice(0, 4), 16) % (L - 1)) + 1;

  for (let k = 0; k < L; k++) {
    const idx = (base + k * stride) % L;
    const cand = arr[idx];
    if (!avoidRegexes.some((r) => r.test(cand))) return cand;
  }
  // Fallback: return base if all banned
  return arr[base];
}

function clean(t) {
  return String(t)
    .replace(/\s{2,}/g, " ")
    .replace(/\b(undefined|null|neutral)\b/gi, "")
    .trim();
}
function dedupeTitle(text, title) {
  if (!text || !title) return text;
  const low = title.toLowerCase();
  return text
    .split(/\s+/)
    .filter((w) => !low.includes(w.toLowerCase()))
    .join(" ")
    .trim();
}
function clampCTA(t, n = 48) {
  if (!t) return "";
  if (t.length <= n) return t;
  let cut = t.slice(0, n).replace(/\s+\S*$/, "");
  if (!cut.endsWith("→")) cut += "…";
  return cut;
}
function clampSubtitle(t, n = 96) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n);
  return t.slice(0, cut > 40 ? cut : n).trim() + "…";
}

// ───────────────────────────────────────────────────────────────────────────────
// BANLIST (kills generic / repetitive phrasing deterministically)
// ───────────────────────────────────────────────────────────────────────────────
const BAN_CTA = [
  /Enhance intelligent systems/i,
  /Optimise automation flows/i,
  /Automate your workflows/i,
  /Accelerate workflows/i,
  /Simplify operations/i,
  /Run smarter platforms?/i,
  /Build your workflows/i,
];

const BAN_SUB = [
  /helps you build smarter, faster/i,
  /turns complex work into intelligent automation/i,
  /process automation at scale/i,
  /using AI-?powered optimisation/i,
  /using optimisation using/i,
  /through .* through/i,
  /across your workflows\./i,
];

// ───────────────────────────────────────────────────────────────────────────────
// CTA objects
// ───────────────────────────────────────────────────────────────────────────────
const CTA_OBJECTS = {
  ai: ["model workflows", "data cleanup", "prompt ops", "AI pipelines", "agent stack"],
  marketing: ["campaigns", "funnel steps", "lead capture", "ad sets", "content pipeline"],
  productivity: ["daily workflows", "task queue", "priority stack", "ops routine", "handoffs"],
  software: ["release flow", "internal tools", "platform tasks", "tech stack", "ops engine"],
  courses: ["learning path", "study plan", "skill track", "training flow", "curriculum"],
  business: ["team ops", "playbooks", "handoffs", "reviews", "cascaded goals"],
  web: ["component library", "build pipeline", "deploy steps", "page templates", "UI inventory"],
  ecommerce: ["checkout", "retention flow", "catalog ops", "product listings", "offer pages"],
  creative: ["design system", "asset pipeline", "storyboards", "visual edits", "review rounds"],
};

// ───────────────────────────────────────────────────────────────────────────────
// Longtail / Bases / Modifiers (refreshed to avoid generic seams)
// UK spelling (“optimisation”)
// ───────────────────────────────────────────────────────────────────────────────
const LONGTAIL = {
  ai: [
    "agentic workflows",
    "retrieval-augmented tasks",
    "prompt-safe orchestration",
    "automated data labelling",
    "evaluation runs for quality",
  ],
  marketing: [
    "conversion-ready journeys",
    "message-market alignment",
    "audience segmentation at depth",
    "offer testing cadence",
    "post-click optimisation",
  ],
  productivity: [
    "single-source of truth habits",
    "friction-free task handoffs",
    "clean daily cadence",
    "context-switch reduction",
    "repeatable SOPs",
  ],
  software: [
    "release hygiene",
    "regression-free shipping",
    "issue triage discipline",
    "runtime clarity",
    "operational observability",
  ],
  courses: [
    "competency-based milestones",
    "applied exercises",
    "mentor-grade guidance",
    "paced progression",
    "skill transfer in practice",
  ],
  business: [
    "operating rhythm",
    "decision-making clarity",
    "execution at scale",
    "scorecard consistency",
    "aligned priorities",
  ],
  web: [
    "design-to-dev continuity",
    "component-driven builds",
    "accessible interfaces",
    "performance budgets",
    "clean deployments",
  ],
  ecommerce: [
    "cart recovery tactics",
    "checkout friction removal",
    "offer sequencing",
    "LTV uplift motions",
    "merchandising clarity",
  ],
  creative: [
    "on-brand delivery",
    "editorial polish",
    "review-ready assets",
    "visual cohesion",
    "story clarity",
  ],
};

const SUB_BASE = {
  ai: [
    "ships practical AI outcomes without extra headcount",
    "lets teams add AI where it actually moves the metric",
  ],
  marketing: [
    "clarifies the path from attention to purchase",
    "keeps your funnel consistent and measurable",
  ],
  productivity: [
    "removes drag so work flows with less friction",
    "keeps priorities visible and momentum high",
  ],
  software: [
    "keeps releases steady and predictable",
    "reduces toil across your engineering workflow",
  ],
  courses: [
    "turns knowledge into demonstrable skill",
    "keeps you progressing with clear checkpoints",
  ],
  business: [
    "improves execution without adding complexity",
    "keeps teams aligned around measurable outcomes",
  ],
  web: [
    "helps you ship cleaner, faster web work",
    "keeps builds consistent from design to deploy",
  ],
  ecommerce: [
    "removes friction that hurts conversion",
    "keeps store ops simple and measurable",
  ],
  creative: [
    "makes creative work clearer and easier to ship",
    "keeps feedback loops short and useful",
  ],
};

const MODIFIERS = {
  ai: ["with evaluation-first practices", "with human-in-the-loop guardrails"],
  marketing: ["with useful analytics, not noise", "with tidy campaign ops"],
  productivity: ["with simple rituals teams keep", "with light-touch automation"],
  software: ["with sensible guardrails", "with boring, reliable processes"],
  courses: ["with feedback you can act on", "with peer-grade examples"],
  business: ["with simple scorecards", "with meeting-light cadence"],
  web: ["with maintainable components", "with deploy-ready assets"],
  ecommerce: ["with honest performance metrics", "with stable merchandising"],
  creative: ["with practical templates", "with review-friendly previews"],
};

// Anchors are intentionally short and specific
const ANCHORS = {
  ai: ["inside your AI workflows", "across your agent stack"],
  marketing: ["across your campaigns", "in your funnel"],
  productivity: ["in your daily flow", "across your routines"],
  software: ["across your delivery pipeline", "in your platform"],
  courses: ["through a clear study path"],
  business: ["across your operating rhythm"],
  web: ["in your web projects"],
  ecommerce: ["across your store"],
  creative: ["in your creative process"],
};

function addAnchor(sub, cat, seed) {
  const a = ANCHORS[cat];
  if (!a) return sub;
  if (/\b(across|within|in|for)\s+your\b/i.test(sub)) return sub;
  return `${sub.replace(/\.*$/, "")} ${hashPick(seed + ":anch", a)}.`;
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA templates (refreshed, no banned phrases)
// ───────────────────────────────────────────────────────────────────────────────
const CTA_TEMPLATES = {
  ai: [
    "Ship AI features faster →",
    "Automate {obj} safely →",
    "Cut manual steps in {obj} →",
    "Build reliable AI pipelines →",
  ],
  marketing: [
    "Lift conversion on {obj} →",
    "Tidy your funnel steps →",
    "Scale repeatable campaigns →",
    "Make offers convert clearer →",
  ],
  productivity: [
    "Make your day flow better →",
    "Close the loop on tasks →",
    "Reduce handoffs friction →",
    "Bring order to {obj} →",
  ],
  software: [
    "Ship with fewer regressions →",
    "Automate recurring platform work →",
    "Stabilise your release flow →",
    "Declutter your tech stack →",
  ],
  courses: [
    "Turn study into skill →",
    "Progress with a clear plan →",
    "Learn by doing, faster →",
    "Finish the track you start →",
  ],
  business: [
    "Tighten team execution →",
    "Make goals actually happen →",
    "Build a calmer operating rhythm →",
    "Remove process drag →",
  ],
  web: [
    "Ship cleaner web builds →",
    "Speed up component work →",
    "Make deploys predictable →",
    "Organise your UI library →",
  ],
  ecommerce: [
    "Remove checkout friction →",
    "Grow repeat purchases →",
    "Clean up catalog ops →",
    "Make merchandising simple →",
  ],
  creative: [
    "Ship on-brand assets faster →",
    "Shorten review cycles →",
    "Tidy your design system →",
    "Make briefs produce better work →",
  ],
};

// ───────────────────────────────────────────────────────────────────────────────
// Dedupe / seam normalisers
// ───────────────────────────────────────────────────────────────────────────────
function dedupePhrases(parts) {
  const text = parts.filter(Boolean).join(" ").replace(/\s*—\s*/g, " — ").trim();
  if (!text) return text;

  const words = text.split(/\s+/);
  const seenUni = new Set();
  const seenBi = new Set();
  const out = [];

  for (let i = 0; i < words.length; i++) {
    const cur = words[i];
    const uni = cur.toLowerCase();
    const bi = i > 0 ? (words[i - 1] + " " + cur).toLowerCase() : null;

    if (cur === "—") {
      if (out.length && out[out.length - 1] !== "—") out.push(cur);
      continue;
    }

    if (!seenUni.has(uni) && (!bi || !seenBi.has(bi))) {
      out.push(cur);
      seenUni.add(uni);
      if (bi) seenBi.add(bi);
    }
  }

  return out.join(" ").replace(/\s*—\s*/g, " — ").replace(/\s{2,}/g, " ").trim();
}

function normalizeSeams(t) {
  let s = t;

  s = s.replace(/\boptimization\b/gi, "optimisation");
  s = s.replace(/\b(delivers|adds|provides|offers|gives)\s+to\s+(\w+)/gi, "$1 $2");
  s = s.replace(/\b(using|through|with)\s+([a-z0-9-]+)\s+\1\b/gi, "$1 $2");
  s = s.replace(/\b(using|through|with)\s+([a-z0-9-]+)\s+(using|through|with)\s+/gi, "$1 $2 ");
  s = s.replace(/\bat scale(?:\s+at scale)+/gi, "at scale");
  s = s.replace(/\b(ai-?powered)\b.*?\b\1\b/gi, "$1");
  s = s.replace(/\b(machine-learning)\b.*?\b\1\b/gi, "$1");
  s = s.replace(/(?:\s*—\s*){2,}/g, " — ");
  s = s.replace(/^(—\s*)+/, "").replace(/(\s*—\s*)+$/, "");
  s = s.replace(/\s{2,}/g, " ").trim();

  return s;
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA ENGINE v6.5
// ───────────────────────────────────────────────────────────────────────────────
export function createCtaEngine() {
  loadMemory(); // harmless

  return {
    generate({ title = "", cat = "software", slug = "" }) {
      const seed = slug || title || "x";
      const templates = CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;
      const objs = CTA_OBJECTS[cat] || CTA_OBJECTS.software;

      const base = hashPickAvoid(seed + ":cta", templates, BAN_CTA);
      const obj = hashPick(seed + ":obj", objs);

      let cta = clean(base.replace("{obj}", obj));
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      // final ban check; if still bad (all banned), fall back generic but clean
      if (BAN_CTA.some((r) => r.test(cta))) cta = "View the details →";
      return cta || "View the details →";
    },

    generateSubtitle({ title = "", category = "software", slug = "" }) {
      const seed = slug || title || "x";

      const baseOpts = SUB_BASE[category] || SUB_BASE.software;
      const longOpts = LONGTAIL[category] || LONGTAIL.software;
      const modOpts = MODIFIERS[category] || MODIFIERS.software;

      const base = hashPickAvoid(seed + ":subbase", baseOpts, BAN_SUB).replace(/\.*$/, "");
      const lt = hashPickAvoid(seed + ":long", longOpts, BAN_SUB);
      const mod = hashPickAvoid(seed + ":mod", modOpts, BAN_SUB);

      // Build → dedupe → normalise
      let stitched = dedupePhrases([base, "—", lt, mod]);
      stitched = normalizeSeams(stitched);
      stitched = clean(stitched);
      stitched = addAnchor(stitched, category, seed);
      stitched = dedupeTitle(stitched, title);
      stitched = clampSubtitle(stitched);

      if (BAN_SUB.some((r) => r.test(stitched))) stitched = "Clear, measurable improvement.";
      return stitched || "Clear, measurable improvement.";
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────────
export function enrichDeals(deals = []) {
  const engine = createCtaEngine();

  return deals.map((d) => {
    const prev = d.seo || {};
    const category = (d.category || "software").toLowerCase();
    const title = d.title || "";
    const slug =
      d.slug ||
      title.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

    const cta =
      prev.cta && prev.cta.trim()
        ? prev.cta
        : engine.generate({ title, cat: category, slug });

    const subtitle =
      prev.subtitle && prev.subtitle.trim()
        ? prev.subtitle
        : engine.generateSubtitle({ title, category, slug });

    return {
      ...d,
      seo: { ...prev, cta, subtitle },
    };
  });
}

export default { createCtaEngine, enrichDeals };
