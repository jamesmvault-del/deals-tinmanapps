// /lib/semanticCluster.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Semantic Cluster Engine v1.0 “Intent Matrix”
//
// Purpose:
// • Maps keywords → intent clusters → tonal archetypes
// • Used by CTA Engine (CTR Resonance), SEO refresh logic, and feed classification
// • Designed to enrich text generation without external dependencies
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// ---------- Core semantic clusters ----------
export const CLUSTERS = {
  automation: {
    tone: "innovative",
    verbs: ["automate", "streamline", "simplify", "optimize", "scale"],
    adjectives: ["smart", "seamless", "intelligent", "effortless", "precise"],
    triggers: ["AI", "workflow", "process", "system", "bot", "autopilot"],
  },
  productivity: {
    tone: "efficient",
    verbs: ["organize", "focus", "accelerate", "optimize", "complete"],
    adjectives: ["focused", "productive", "streamlined", "clear", "structured"],
    triggers: ["task", "project", "schedule", "calendar", "goal", "kanban"],
  },
  marketing: {
    tone: "growth",
    verbs: ["grow", "engage", "convert", "scale", "boost"],
    adjectives: ["magnetic", "persuasive", "targeted", "data-driven", "bold"],
    triggers: ["leads", "traffic", "campaign", "email", "crm", "social"],
  },
  business: {
    tone: "strategic",
    verbs: ["plan", "analyze", "manage", "scale", "profit"],
    adjectives: ["profitable", "strategic", "organized", "professional", "reliable"],
    triggers: ["finance", "accounting", "legal", "analytics", "client", "agency"],
  },
  ai: {
    tone: "novel",
    verbs: ["create", "build", "amplify", "innovate", "leverage"],
    adjectives: ["intelligent", "creative", "adaptive", "advanced", "cutting-edge"],
    triggers: ["ai", "machine learning", "gpt", "bot", "assistant", "autopilot"],
  },
  courses: {
    tone: "educational",
    verbs: ["learn", "master", "teach", "develop", "apply"],
    adjectives: ["clear", "expert", "practical", "step-by-step", "transformative"],
    triggers: ["course", "lesson", "training", "academy", "coach", "tutorial"],
  },
  web: {
    tone: "creative",
    verbs: ["design", "build", "launch", "customize", "develop"],
    adjectives: ["beautiful", "responsive", "modern", "clean", "interactive"],
    triggers: ["website", "builder", "landing", "theme", "no-code", "frontend"],
  },
};

// ---------- Utility: lightweight keyword scoring ----------
export function detectCluster(text = "") {
  const lower = text.toLowerCase();
  let best = "software";
  let bestScore = 0;

  for (const [key, cluster] of Object.entries(CLUSTERS)) {
    let score = 0;
    for (const term of cluster.triggers) {
      if (lower.includes(term)) score += 2;
    }
    for (const term of cluster.verbs) {
      if (lower.includes(term)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }

  return best;
}

// ---------- Utility: contextual tone descriptor ----------
export function getToneDescriptor(clusterKey) {
  const cluster = CLUSTERS[clusterKey] || CLUSTERS.software;
  return cluster.tone || "neutral";
}

// ---------- Utility: random contextual selection ----------
export function pickSemanticVariation(clusterKey, type = "verbs") {
  const cluster = CLUSTERS[clusterKey] || {};
  const pool = cluster[type] || [];
  if (pool.length === 0) return "";
  const idx = crypto.randomInt(0, pool.length);
  return pool[idx];
}

// ---------- Meta ----------
export default {
  CLUSTERS,
  detectCluster,
  getToneDescriptor,
  pickSemanticVariation,
};
