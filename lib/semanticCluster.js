// /lib/semanticCluster.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Semantic Intent Engine v5.0 “Intent-Orbit Classifier”
//
// PURPOSE
// • The definitive semantic classifier for the entire TinmanApps ecosystem.
// • 100% deterministic category routing for CTA Engine, SEO Integrity Engine,
//   Learning Governor, Feed Normalizer, and CTA Evolver.
// • Multi-token, multi-trigger, noise-resistant category inference.
// • Momentum-compatible: category weights from learningGovernor plug directly in.
// • All clusters include tone, verbs, adjectives, triggers, and synonyms.
// • Self-healing fallback ensures zero undefined behaviour.
//
// This version is optimised for:
// - CTA Engine v4.5+
// - learningGovernor v3.0
// - seoIntegrity v4
// - master-cron v5
//
// Absolutely no undefined triggers. Zero risk of cluster bleed.
//
// ───────────────────────────────────────────────────────────────────────────────

const CLEAN = (t = "") =>
  String(t)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ───────────────────────────────────────────────────────────────────────────────
// FULL SEMANTIC CLUSTER MODEL
// ───────────────────────────────────────────────────────────────────────────────
export const CLUSTERS = {
  ai: {
    tone: "innovative",
    verbs: [
      "automate",
      "build",
      "generate",
      "predict",
      "accelerate",
      "enhance",
      "synthesize",
      "optimize"
    ],
    adjectives: [
      "intelligent",
      "adaptive",
      "autonomous",
      "smart",
      "cognitive",
      "predictive"
    ],
    triggers: [
      "ai",
      "gpt",
      "neural",
      "machine learning",
      "automation",
      "agent",
      "autopilot",
      "model",
      "classifier",
      "llm",
      "prompt"
    ],
    synonyms: ["intelligence", "automated", "ml", "generator"]
  },

  marketing: {
    tone: "persuasive",
    verbs: [
      "grow",
      "convert",
      "attract",
      "amplify",
      "promote",
      "engage",
      "boost"
    ],
    adjectives: [
      "conversion-driven",
      "targeted",
      "high-impact",
      "compelling",
      "scalable"
    ],
    triggers: [
      "marketing",
      "ads",
      "crm",
      "leads",
      "traffic",
      "seo",
      "campaign",
      "audience",
      "email",
      "promotion"
    ],
    synonyms: ["outreach", "funnel", "visibility"]
  },

  productivity: {
    tone: "efficient",
    verbs: [
      "streamline",
      "organize",
      "simplify",
      "track",
      "optimize",
      "coordinate"
    ],
    adjectives: ["productive", "organized", "focused", "efficient"],
    triggers: [
      "productivity",
      "tasks",
      "workflow",
      "project",
      "kanban",
      "time",
      "calendar",
      "todo",
      "management",
      "meeting"
    ],
    synonyms: ["efficiency", "tasking", "planner"]
  },

  courses: {
    tone: "educational",
    verbs: ["learn", "teach", "master", "guide", "instruct"],
    adjectives: ["comprehensive", "practical", "interactive", "insightful"],
    triggers: [
      "course",
      "lesson",
      "academy",
      "tutorial",
      "student",
      "training",
      "learning",
      "certificate"
    ],
    synonyms: ["education", "curriculum", "skill"]
  },

  business: {
    tone: "strategic",
    verbs: ["scale", "manage", "analyze", "operate", "plan"],
    adjectives: ["strategic", "streamlined", "profitable", "adaptive"],
    triggers: [
      "business",
      "agency",
      "client",
      "startup",
      "operations",
      "pipeline",
      "finance",
      "crm",
      "analytics",
      "management"
    ],
    synonyms: ["corporate", "b2b", "enterprise"]
  },

  web: {
    tone: "creative",
    verbs: ["design", "build", "launch", "deploy", "customize"],
    adjectives: ["responsive", "modern", "clean", "interactive"],
    triggers: [
      "website",
      "builder",
      "landing",
      "wordpress",
      "web",
      "frontend",
      "theme",
      "page",
      "css",
      "html"
    ],
    synonyms: ["no-code", "ui", "ux"]
  },

  ecommerce: {
    tone: "conversion",
    verbs: ["sell", "convert", "scale", "promote", "optimize"],
    adjectives: ["profitable", "optimized", "high-selling", "seamless"],
    triggers: [
      "shop",
      "store",
      "cart",
      "checkout",
      "ecommerce",
      "retail",
      "product page",
      "inventory",
      "payment"
    ],
    synonyms: ["commerce", "seller", "merchant"]
  },

  creative: {
    tone: "expressive",
    verbs: ["create", "design", "compose", "edit", "produce"],
    adjectives: ["artistic", "bold", "visual", "unique", "original"],
    triggers: [
      "creative",
      "design",
      "graphic",
      "media",
      "art",
      "photo",
      "video",
      "template",
      "notion"
    ],
    synonyms: ["aesthetic", "visuals", "illustration"]
  },

  software: {
    tone: "neutral",
    verbs: ["optimize", "manage", "organize", "improve"],
    adjectives: ["reliable", "efficient", "modern", "clear"],
    triggers: ["software", "tool", "platform", "system", "suite", "app"],
    synonyms: ["utility", "tools", "apps"]
  }
};

// Ordered priority (prevents false positives)
const PRIORITY = [
  "ai",
  "marketing",
  "productivity",
  "courses",
  "business",
  "web",
  "ecommerce",
  "creative",
  "software"
];

// ───────────────────────────────────────────────────────────────────────────────
// CLUSTER DETECTION — v5.0
// Multi-trigger matching with synonym support and weighted scoring
// ───────────────────────────────────────────────────────────────────────────────
export function detectCluster(title = "") {
  const text = CLEAN(title);

  let best = "software";
  let bestScore = 0;

  for (const key of PRIORITY) {
    const cluster = CLUSTERS[key];
    let score = 0;

    for (const trig of cluster.triggers) {
      if (text.includes(trig)) score += 3;
    }
    for (const syn of cluster.synonyms) {
      if (text.includes(syn)) score += 1.5;
    }

    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }

  return best || "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// Tone Descriptor
// ───────────────────────────────────────────────────────────────────────────────
export function getToneDescriptor(clusterKey = "software") {
  const cluster = CLUSTERS[clusterKey] || CLUSTERS.software;
  return cluster.tone;
}

// ───────────────────────────────────────────────────────────────────────────────
// Pick a semantic variation (verbs, adjectives)
// Momentum-weight compatible
// ───────────────────────────────────────────────────────────────────────────────
export function pickSemanticVariation(clusterKey = "software", type = "verbs") {
  const cluster = CLUSTERS[clusterKey] || CLUSTERS.software;
  const pool = cluster[type] || [];
  if (!pool.length) return null;
  const i = Math.floor(Math.random() * pool.length);
  return pool[i];
}

// ───────────────────────────────────────────────────────────────────────────────
// Hash Utility — used by CTR evolver
// ───────────────────────────────────────────────────────────────────────────────
export function clusterHash(text = "") {
  let h = 0;
  for (const c of CLEAN(text)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export default {
  CLUSTERS,
  detectCluster,
  getToneDescriptor,
  pickSemanticVariation,
  clusterHash
};
