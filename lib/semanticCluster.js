// /lib/semanticCluster.js
// TinmanApps — Semantic Intent Cluster v1.0 “CTR-Resonance Backbone”
// ───────────────────────────────────────────────────────────────────────────────
// Purpose:
// • Provides tone, verb, and adjective pools per semantic category
// • Enables keyword-driven CTA and subtitle variation
// • Supplies consistent fallback (“software”) for safe inference
// ───────────────────────────────────────────────────────────────────────────────

export const CLUSTERS = {
  ai: {
    tone: "innovative",
    verbs: ["automate", "build", "generate", "analyze", "enhance", "accelerate"],
    adjectives: ["intelligent", "adaptive", "autonomous", "creative", "smart"],
    triggers: ["ai", "gpt", "automation", "assistant", "autopilot", "agent", "neural"],
  },
  marketing: {
    tone: "persuasive",
    verbs: ["boost", "grow", "convert", "attract", "engage", "amplify"],
    adjectives: ["profitable", "viral", "targeted", "high-converting", "impactful"],
    triggers: ["marketing", "sales", "email", "leads", "crm", "traffic", "ads", "campaign"],
  },
  productivity: {
    tone: "efficient",
    verbs: ["streamline", "organize", "simplify", "track", "optimize"],
    adjectives: ["productive", "focused", "organized", "effective", "disciplined"],
    triggers: ["workflow", "tasks", "project", "time", "calendar", "focus"],
  },
  courses: {
    tone: "educational",
    verbs: ["learn", "master", "teach", "train", "educate", "guide"],
    adjectives: ["practical", "comprehensive", "insightful", "interactive", "hands-on"],
    triggers: ["course", "lesson", "academy", "tutorial", "student", "learning", "training"],
  },
  business: {
    tone: "strategic",
    verbs: ["scale", "manage", "analyze", "optimize", "grow"],
    adjectives: ["profitable", "strategic", "streamlined", "trusted", "adaptive"],
    triggers: ["client", "team", "finance", "agency", "startup", "analytics"],
  },
  web: {
    tone: "creative",
    verbs: ["design", "build", "launch", "customize", "develop"],
    adjectives: ["beautiful", "responsive", "modern", "clean", "interactive"],
    triggers: ["website", "builder", "landing", "theme", "no-code", "frontend"],
  },
  ecommerce: {
    tone: "conversion",
    verbs: ["sell", "grow", "promote", "scale", "convert"],
    adjectives: ["profitable", "optimized", "high-selling", "engaging", "seamless"],
    triggers: ["shop", "store", "cart", "checkout", "ecommerce", "retail"],
  },
  creative: {
    tone: "expressive",
    verbs: ["create", "design", "compose", "produce", "edit"],
    adjectives: ["artistic", "bold", "visual", "unique", "original"],
    triggers: ["video", "photo", "media", "art", "graphic", "creative"],
  },
  // NEW universal fallback cluster — ensures no undefined tone errors
  software: {
    tone: "neutral",
    verbs: ["optimize", "manage", "organize", "improve"],
    adjectives: ["reliable", "efficient", "clear", "modern"],
    triggers: ["software", "tool", "platform", "system", "suite"],
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// Cluster Detection
// ───────────────────────────────────────────────────────────────────────────────
export function detectCluster(title = "") {
  const t = title.toLowerCase();
  for (const [key, cluster] of Object.entries(CLUSTERS)) {
    if (cluster.triggers.some((kw) => t.includes(kw))) return key;
  }
  return "software"; // fallback always guaranteed
}

// ───────────────────────────────────────────────────────────────────────────────
// Tone Descriptor
// ───────────────────────────────────────────────────────────────────────────────
export function getToneDescriptor(clusterKey = "software") {
  const cluster = CLUSTERS[clusterKey] || CLUSTERS.software;
  return cluster.tone || "neutral";
}

// ───────────────────────────────────────────────────────────────────────────────
// Weighted Variation Pickers
// ───────────────────────────────────────────────────────────────────────────────
export function pickSemanticVariation(clusterKey = "software", type = "verbs") {
  const cluster = CLUSTERS[clusterKey] || CLUSTERS.software;
  const pool = cluster[type] || [];
  if (!pool.length) return null;
  const i = Math.floor(Math.random() * pool.length);
  return pool[i];
}

// ───────────────────────────────────────────────────────────────────────────────
// Hash Utility (optional use for CTR feedback loop)
// ───────────────────────────────────────────────────────────────────────────────
export function clusterHash(title = "") {
  return [...title].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0);
}

export default {
  CLUSTERS,
  detectCluster,
  getToneDescriptor,
  pickSemanticVariation,
  clusterHash,
};
