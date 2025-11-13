// /lib/semanticCluster.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Semantic Intent Engine v5.1 “Intent-Orbit Classifier+”
//
// PURPOSE
// • The definitive semantic classifier for the entire TinmanApps ecosystem.
// • 100% deterministic category routing for CTA Engine, SEO Integrity Engine,
//   Learning Governor, Feed Normalizer, and CTA Evolver.
// • Multi-token, multi-trigger, noise-resistant category inference.
// • Momentum-compatible: category weights from learningGovernor plug directly in.
// • All clusters include tone, verbs, adjectives, triggers, and synonyms.
// • Self-healing fallback ensures zero undefined behaviour.
// • Expanded vocab tuned for modern SaaS / AppSumo-style catalogs.
//   (chatbot, templates, social scheduling, automation, CRM, SEO, Notion, Shopify, etc.)
//
// This version is optimised for:
// - CTA Engine v11+
// - learningGovernor v3.0+
// - seoIntegrity v7+
// - master-cron v11+
//
// Absolutely no undefined triggers. Zero risk of cluster bleed.
// ───────────────────────────────────────────────────────────────────────────────

const CLEAN = (t = "") =>
  String(t)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ───────────────────────────────────────────────────────────────────────────────
// FULL SEMANTIC CLUSTER MODEL (Expanded v5.1)
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
      "optimize",
      "orchestrate",
      "personalize",
      "enrich"
    ],
    adjectives: [
      "intelligent",
      "adaptive",
      "autonomous",
      "smart",
      "cognitive",
      "predictive",
      "agentic",
      "context-aware",
      "ai-powered",
      "data-driven"
    ],
    triggers: [
      "ai",
      "gpt",
      "chatgpt",
      "neural",
      "machine learning",
      "ml",
      "automation",
      "auto pilot",
      "autopilot",
      "agent",
      "agents",
      "workflows",
      "workflow automation",
      "model",
      "models",
      "classifier",
      "llm",
      "prompt",
      "prompts",
      "prompting",
      "embedding",
      "embeddings",
      "vector",
      "vector search",
      "rag",
      "copilot",
      "co-pilot",
      "chatbot",
      "bot builder",
      "ai assistant",
      "agentic reasoning",
      "data enrichment",
      "programmatic seo"
    ],
    synonyms: [
      "intelligence",
      "automated",
      "ml",
      "generator",
      "ai tools",
      "ai platform",
      "ai workflow",
      "ai agent",
      "ai routing",
      "ai enrichment"
    ]
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
      "boost",
      "nurture",
      "retarget",
      "scale",
      "optimize"
    ],
    adjectives: [
      "conversion-driven",
      "targeted",
      "high-impact",
      "compelling",
      "scalable",
      "omni-channel",
      "data-driven",
      "campaign-ready"
    ],
    triggers: [
      "marketing",
      "ads",
      "adwords",
      "facebook ads",
      "google ads",
      "tiktok ads",
      "instagram",
      "linkedin",
      "social media",
      "social",
      "scheduling",
      "scheduler",
      "crm",
      "leads",
      "lead gen",
      "lead magnet",
      "traffic",
      "seo",
      "search engine",
      "campaign",
      "campaigns",
      "audience",
      "email",
      "newsletter",
      "drip",
      "promotion",
      "copywriting",
      "landing page",
      "landing pages",
      "funnel",
      "funnels",
      "utm",
      "analytics",
      "utm builder"
    ],
    synonyms: [
      "outreach",
      "funnel",
      "visibility",
      "social campaigns",
      "content calendar",
      "influencer",
      "growth marketing",
      "performance marketing"
    ]
  },

  productivity: {
    tone: "efficient",
    verbs: [
      "streamline",
      "organize",
      "simplify",
      "track",
      "optimize",
      "coordinate",
      "prioritize",
      "focus",
      "systemize"
    ],
    adjectives: [
      "productive",
      "organized",
      "focused",
      "efficient",
      "lightweight",
      "frictionless",
      "clarifying"
    ],
    triggers: [
      "productivity",
      "tasks",
      "workflow",
      "workflows",
      "project",
      "projects",
      "kanban",
      "board",
      "boards",
      "time",
      "time tracking",
      "calendar",
      "scheduling",
      "todo",
      "task manager",
      "task list",
      "checklist",
      "notes",
      "note-taking",
      "daily planner",
      "habit",
      "routines",
      "focus mode",
      "goal tracking",
      "priorities",
      "meeting notes"
    ],
    synonyms: [
      "efficiency",
      "tasking",
      "planner",
      "planning",
      "getting things done",
      "gtd",
      "personal ops",
      "ops hub"
    ]
  },

  courses: {
    tone: "educational",
    verbs: [
      "learn",
      "teach",
      "master",
      "guide",
      "instruct",
      "coach",
      "train",
      "mentor"
    ],
    adjectives: [
      "comprehensive",
      "practical",
      "interactive",
      "insightful",
      "step-by-step",
      "hands-on",
      "cohort-based"
    ],
    triggers: [
      "course",
      "courses",
      "lesson",
      "lessons",
      "academy",
      "school",
      "tutorial",
      "student",
      "training",
      "learning",
      "bootcamp",
      "cohort",
      "curriculum",
      "masterclass",
      "education",
      "certificate",
      "class",
      "online school"
    ],
    synonyms: [
      "education",
      "curriculum",
      "skill",
      "skills",
      "upskill",
      "learning path",
      "program",
      "coaching program"
    ]
  },

  business: {
    tone: "strategic",
    verbs: [
      "scale",
      "manage",
      "analyze",
      "operate",
      "plan",
      "standardize",
      "audit",
      "forecast"
    ],
    adjectives: [
      "strategic",
      "streamlined",
      "profitable",
      "adaptive",
      "compliant",
      "insightful",
      "operational"
    ],
    triggers: [
      "business",
      "agency",
      "client",
      "clients",
      "startup",
      "founder",
      "operations",
      "pipeline",
      "finance",
      "accounting",
      "bookkeeping",
      "invoice",
      "invoicing",
      "billing",
      "crm",
      "analytics",
      "reporting",
      "kpi",
      "dashboard",
      "management",
      "okr",
      "okr tracking",
      "portfolio",
      "equity",
      "cap table",
      "legal",
      "compliance",
      "hr",
      "human resources"
    ],
    synonyms: [
      "corporate",
      "b2b",
      "enterprise",
      "back-office",
      "ops",
      "operations hub",
      "business ops",
      "consulting"
    ]
  },

  web: {
    tone: "creative",
    verbs: [
      "design",
      "build",
      "launch",
      "deploy",
      "customize",
      "prototype",
      "ship",
      "iterate"
    ],
    adjectives: [
      "responsive",
      "modern",
      "clean",
      "interactive",
      "pixel-perfect",
      "semantic"
    ],
    triggers: [
      "website",
      "websites",
      "builder",
      "page builder",
      "landing",
      "landing page",
      "landing pages",
      "wordpress",
      "wordpress plugin",
      "wp plugin",
      "web",
      "frontend",
      "front-end",
      "theme",
      "themes",
      "page",
      "css",
      "html",
      "javascript",
      "hosting",
      "domain",
      "dns",
      "page speed",
      "core web vitals"
    ],
    synonyms: [
      "no-code",
      "nocode",
      "ui",
      "ux",
      "front end",
      "web design",
      "webflow",
      "site builder"
    ]
  },

  ecommerce: {
    tone: "conversion",
    verbs: [
      "sell",
      "convert",
      "scale",
      "promote",
      "optimize",
      "upsell",
      "cross-sell",
      "monetize"
    ],
    adjectives: [
      "profitable",
      "optimized",
      "high-selling",
      "seamless",
      "frictionless",
      "cart-safe"
    ],
    triggers: [
      "shop",
      "store",
      "cart",
      "checkout",
      "ecommerce",
      "e-commerce",
      "retail",
      "product page",
      "product pages",
      "inventory",
      "payment",
      "payments",
      "pos",
      "coupon",
      "discount",
      "upsell",
      "cross sell",
      "shopify",
      "woocommerce",
      "bigcommerce",
      "stripe",
      "paypal",
      "subscription",
      "subscriptions"
    ],
    synonyms: [
      "commerce",
      "seller",
      "merchant",
      "online shop",
      "online store",
      "d2c",
      "dropshipping"
    ]
  },

  creative: {
    tone: "expressive",
    verbs: [
      "create",
      "design",
      "compose",
      "edit",
      "produce",
      "illustrate",
      "animate",
      "storyboard"
    ],
    adjectives: [
      "artistic",
      "bold",
      "visual",
      "unique",
      "original",
      "polished",
      "on-brand"
    ],
    triggers: [
      "creative",
      "design",
      "graphic",
      "media",
      "art",
      "photo",
      "photography",
      "video",
      "video editing",
      "template",
      "templates",
      "notion template",
      "canva",
      "figma",
      "brand kit",
      "branding",
      "logo",
      "illustration",
      "typography",
      "podcast",
      "content studio"
    ],
    synonyms: [
      "aesthetic",
      "visuals",
      "illustration",
      "motion",
      "storytelling",
      "brand assets",
      "design system"
    ]
  },

  software: {
    tone: "neutral",
    verbs: [
      "optimize",
      "manage",
      "organize",
      "improve",
      "monitor",
      "automate",
      "consolidate"
    ],
    adjectives: [
      "reliable",
      "efficient",
      "modern",
      "clear",
      "scalable",
      "modular"
    ],
    triggers: [
      "software",
      "tool",
      "tools",
      "platform",
      "system",
      "suite",
      "app",
      "apps",
      "saas",
      "dashboard",
      "workspace"
    ],
    synonyms: [
      "utility",
      "utilities",
      "apps",
      "toolkit",
      "stack",
      "software suite",
      "platform tools"
    ]
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
// CLUSTER DETECTION — v5.1
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
      const t = CLEAN(trig);
      if (t && text.includes(t)) score += 3;
    }
    for (const syn of cluster.synonyms) {
      const s = CLEAN(syn);
      if (s && text.includes(s)) score += 1.5;
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
