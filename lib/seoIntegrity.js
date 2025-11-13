// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v6.1 “CTA v11.2 Grammar Sentinel”
// “Zero Mutation • Pure Validation • CTA Structure Rules • Category Lexicon QA”
//
// v6.1 Upgrades (aligned to CTA Engine v11.2)
// • Syncs CTA verb/object clusters EXACTLY with CTA Engine v11.2
// • Validates CTA template: {Verb} your {object}? with {Brand}? {ending}
// • Enforces allowed endings only (no stray arrows / malformed suffixes)
// • Flags broken patterns: “with in one place”, “with instantly”, missing brand
// • Stricter subtitle structure: true two-sentence enforcement + lexicon hardening
//
// Strict guarantee:
//   ❌ never modifies CTA/subtitle
//   ❌ never generates replacements
//   ❌ never trims/corrects text
//   ✔ adds verification meta only
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// CTA v11.2 category clusters — MUST MATCH /lib/ctaEngine.js EXACTLY
const CTA_CLUSTERS = {
  ai: {
    verbs: ["Automate", "Simplify", "Enhance", "Optimize", "Scale", "Accelerate"],
    objects: [
      "AI workflow",
      "agent tasks",
      "smart automation",
      "prompt chains",
      "model outputs",
    ],
  },
  marketing: {
    verbs: ["Boost", "Grow", "Optimize", "Scale", "Elevate", "Drive"],
    objects: [
      "marketing performance",
      "campaigns",
      "brand reach",
      "conversion rate",
      "audience growth",
    ],
  },
  productivity: {
    verbs: ["Simplify", "Organize", "Streamline", "Accelerate", "Focus", "Refine"],
    objects: ["daily work", "task lists", "team output", "workflow", "routine"],
  },
  business: {
    verbs: ["Streamline", "Enhance", "Automate", "Improve", "Elevate", "Align"],
    objects: ["operations", "client management", "sales systems", "reporting", "execution"],
  },
  courses: {
    verbs: ["Learn", "Master", "Advance", "Level-up", "Accelerate", "Develop"],
    objects: ["skills", "knowledge", "career", "expertise", "learning path"],
  },
  web: {
    verbs: ["Build", "Launch", "Design", "Optimize", "Enhance", "Deploy"],
    objects: ["website", "landing pages", "UX", "frontend workflow", "design system"],
  },
  ecommerce: {
    verbs: ["Increase", "Boost", "Simplify", "Optimize", "Enhance", "Grow"],
    objects: ["sales", "checkout flow", "store performance", "customer journey"],
  },
  creative: {
    verbs: ["Create", "Design", "Elevate", "Refine", "Polish", "Reimagine"],
    objects: ["visuals", "content", "media", "creative assets", "brand visuals"],
  },
  software: {
    verbs: ["Simplify", "Optimize", "Automate", "Enhance", "Improve", "Scale"],
    objects: ["workflow", "systems", "stack", "processes", "deployment"],
  },
};

// Allowed CTA endings (must match CTA Engine endings)
const CTA_ENDINGS = [
  "→",
  "instantly →",
  "today →",
  "in one place →",
  "for better results →",
];

// Subtitle lexicons
const KEYWORDS = {
  ai: [
    "AI automation",
    "machine learning",
    "workflow intelligence",
    "GPT tools",
    "autonomous systems",
    "AI productivity",
    "prompt engineering",
    "AI assistant",
    "chatbot",
    "data enrichment",
    "LLM",
    "predictive modeling",
    "agentic workflow",
    "neural network",
    "AI integration",
  ],
  marketing: [
    "lead generation",
    "conversion marketing",
    "SEO analytics",
    "audience targeting",
    "brand growth",
    "digital funnels",
    "marketing automation",
    "campaign management",
    "content performance",
    "social insights",
  ],
  productivity: [
    "workflow optimization",
    "task automation",
    "focus tools",
    "process improvement",
    "daily efficiency",
    "priority management",
    "time tracking",
    "goal setting",
    "habit systems",
  ],
  business: [
    "operations management",
    "sales systems",
    "business automation",
    "client insights",
    "scalable processes",
    "analytics workflow",
    "project management",
    "revenue operations",
    "CRM workflow",
  ],
  courses: [
    "online learning",
    "skill mastery",
    "creator education",
    "learning pathways",
    "micro-learning",
    "training automation",
    "certification courses",
    "learning platform",
    "cohort training",
  ],
  web: [
    "website builder",
    "UX/UI workflow",
    "frontend optimization",
    "design automation",
    "web performance",
    "no-code tools",
    "WordPress",
    "landing pages",
    "Webflow",
    "site performance",
  ],
  ecommerce: [
    "checkout optimization",
    "store performance",
    "cart automation",
    "conversion systems",
    "sales funnels",
    "ecommerce growth",
    "product listings",
    "inventory sync",
    "order automation",
  ],
  creative: [
    "visual design",
    "content creation",
    "branding tools",
    "creative workflow",
    "media automation",
    "design templates",
    "storyboarding",
    "graphic creation",
    "video production",
  ],
  software: [
    "software automation",
    "workflow tools",
    "lifetime deals",
    "productivity apps",
    "SaaS utilities",
    "operations stack",
    "API integration",
    "cloud platform",
    "plugin",
    "automation suite",
  ],
};

const BANNED = ["click here", "buy now", "limited offer", "discount", "cheap", "sale"];

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function stableCat(c) {
  return String(c || "software")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findEnding(cta) {
  for (const end of CTA_ENDINGS) {
    if (cta.endsWith(end)) return end;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA VALIDATOR (v11.2 grammar-aware)
// Expected *ideal* pattern from engine:
//   {Verb} your {object} with {Brand} {ending}
// where ending ∈ CTA_ENDINGS
//
// We validate *around* this pattern and catch anomalies without mutating text.
// ───────────────────────────────────────────────────────────────────────────────
function validateCtaV11(ctaRaw = "", category = "software", title = "") {
  const issues = [];
  const cta = String(ctaRaw || "").trim();
  const cat = stableCat(category);
  const cluster = CTA_CLUSTERS[cat] || CTA_CLUSTERS.software;
  const low = cta.toLowerCase();
  const titleLow = String(title || "").toLowerCase();

  if (!cta) {
    issues.push("cta-missing");
    return issues;
  }

  // Length guard
  if (cta.length > 64) issues.push("cta-too-long");

  // Ending / arrow check
  const ending = findEnding(cta);
  if (!ending) {
    issues.push("cta-bad-ending"); // wrong or missing ending
  } else if (!ending.endsWith("→")) {
    issues.push("cta-no-arrow");
  }

  // "with" usage — must be 0 or 1 (some templates may omit with if object missing)
  const withMatches = low.match(/\bwith\b/g) || [];
  const withCount = withMatches.length;
  if (withCount > 1) issues.push("cta-double-with");

  // Legacy broken patterns from older gens
  if (low.includes("with in one place")) issues.push("cta-broken-with-in-one-place");
  if (low.includes("with instantly")) issues.push("cta-broken-with-instants");
  if (low.includes("with today")) issues.push("cta-broken-with-today");
  if (low.includes("with for better results"))
    issues.push("cta-broken-with-for-better-results");

  // Verb sanity: first token must be in cluster verbs (case-insensitive)
  const verbCandidates = cluster.verbs.map((v) => v.toLowerCase());
  const firstWord = low.split(/\s+/)[0];
  if (!verbCandidates.includes(firstWord)) {
    issues.push("cta-invalid-verb");
  }

  // Object sanity: at least one known object or a soft fallback “workflow”
  const objectHit = cluster.objects.some((o) => low.includes(o.toLowerCase()));
  const hasGenericWorkflow = low.includes("workflow");
  if (!objectHit && !hasGenericWorkflow) {
    issues.push("cta-missing-object");
  }

  // "your" presence strongly expected if object exists
  const hasYour = /\byour\b/i.test(cta);
  if (objectHit && !hasYour) issues.push("cta-missing-your");

  // Brand / product name touch after "with"
  const idxWith = low.indexOf("with ");
  if (withCount === 1 && idxWith >= 0) {
    const afterWith = cta.slice(idxWith + "with ".length).trim();
    // Strip ending to isolate brand chunk
    const end = findEnding(afterWith) || findEnding(cta) || "";
    const brandChunk = end ? afterWith.replace(end, "").trim() : afterWith;

    if (!brandChunk) {
      issues.push("cta-missing-brand-after-with");
    } else {
      // If brand chunk accidentally starts with an ending stub, it's broken
      const chunkLow = brandChunk.toLowerCase();
      const badStartTokens = ["instantly", "today", "in one place", "for better results"];
      if (badStartTokens.some((t) => chunkLow.startsWith(t))) {
        issues.push("cta-bad-brand-chunk");
      }

      // Soft product-name touch: at least one 4+ char token from title present
      if (titleLow) {
        const nameTokens = titleLow.split(/\s+/).filter((w) => w.length > 3);
        if (nameTokens.length) {
          const hasNameToken = nameTokens.some((w) =>
            brandChunk.toLowerCase().includes(w)
          );
          if (!hasNameToken) {
            issues.push("cta-missing-product-name-signal");
          }
        }
      }
    }
  }

  // Ordering sanity: Verb → (your)? → (object)? → with
  const idxVerb = Math.min(
    ...cluster.verbs
      .map((v) => low.indexOf(v.toLowerCase()))
      .filter((i) => i >= 0)
  );
  const idxYour = low.indexOf("your ");
  const idxObject = cluster.objects
    .map((o) => low.indexOf(o.toLowerCase()))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];

  if (idxVerb < 0) issues.push("cta-no-verb-detected");
  if (objectHit && idxObject === undefined) issues.push("cta-object-not-localised");
  if (withCount === 1 && idxWith < 0) issues.push("cta-no-with-detected");

  if (idxVerb >= 0 && idxYour >= 0 && idxVerb > idxYour) {
    issues.push("cta-order-verb-before-your");
  }
  if (idxYour >= 0 && idxObject !== undefined && idxYour > idxObject) {
    issues.push("cta-order-your-before-object");
  }
  if (idxObject !== undefined && idxWith >= 0 && idxObject > idxWith) {
    issues.push("cta-order-object-before-with");
  }

  return issues;
}

// ───────────────────────────────────────────────────────────────────────────────
// Subtitle validator — stricter two-sentence enforcement
// ───────────────────────────────────────────────────────────────────────────────
function validateSubtitle(subRaw = "", title = "", category = "software") {
  const issues = [];
  const sub = String(subRaw || "").trim();
  const cat = stableCat(category);
  const titleLow = (title || "").toLowerCase();

  if (!sub) {
    issues.push("subtitle-missing");
    return issues;
  }

  // True sentence segmentation (ignores trailing whitespace)
  const segments = sub
    .split(/[.!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length !== 2) {
    issues.push("subtitle-not-two-sentences");
  }

  if (sub.length > 160) issues.push("subtitle-too-long");

  if (titleLow && sub.toLowerCase().includes(titleLow)) {
    issues.push("subtitle-title-echo");
  }

  for (const ban of BANNED) {
    if (sub.toLowerCase().includes(ban)) issues.push(`subtitle-banned:${ban}`);
  }

  // Category lexicon enforcement — at least one full keyword phrase
  const lex = KEYWORDS[cat] || KEYWORDS.software;
  const subLow = sub.toLowerCase();
  const hasLexicon = lex.some((k) => subLow.includes(k.toLowerCase()));
  if (!hasLexicon) issues.push("subtitle-missing-lexicon");

  // Product-name touch: enforced for multi-word or long titles
  const nameWords = titleLow.split(/\s+/).filter((w) => w.length > 3);
  const longTitle = titleLow.replace(/\s+/g, "").length >= 6;
  const enforce = nameWords.length > 1 || longTitle;

  if (enforce) {
    const hasName = nameWords.some((w) => w && subLow.includes(w));
    if (!hasName) issues.push("subtitle-missing-product-name");
  }

  // Basic structural polish checks (non-fatal)
  const startsLowercase = /^[a-z]/.test(sub);
  if (startsLowercase) issues.push("subtitle-leading-lowercase");

  return issues;
}

// ───────────────────────────────────────────────────────────────────────────────
// Telemetry
// ───────────────────────────────────────────────────────────────────────────────
function entropy(arr) {
  const total = arr.length || 1;
  const counts = {};
  for (const x of arr) counts[x || ""] = (counts[x || ""] || 0) + 1;
  let H = 0;
  for (const k in counts) {
    const p = counts[k] / total;
    H += -p * Math.log2(p);
  }
  return Number.isFinite(H) ? H : 0;
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN — ensureSeoIntegrity(feed)
// Validation-only, no mutation of CTA/subtitle content.
// ───────────────────────────────────────────────────────────────────────────────
export function ensureSeoIntegrity(feed) {
  if (!Array.isArray(feed) || feed.length === 0) {
    console.warn("⚠️ [SEO Integrity] Empty feed.");
    return [];
  }

  const now = new Date().toISOString();
  const seenCTA = new Set();
  const seenSUB = new Set();
  const problems = [];

  const validated = feed.map((item) => {
    const cat = stableCat(item.category);
    const title = item.title || "";
    const seo = item.seo || {};

    // CTA v11.2 strict validation
    const ctaIssues = validateCtaV11(seo.cta, cat, title);

    // Subtitle checks
    const subIssues = validateSubtitle(seo.subtitle, title, cat);

    const ctaKey = (seo.cta || "").trim();
    const subKey = (seo.subtitle || "").trim();

    // Duplication detection
    if (ctaKey) {
      if (seenCTA.has(ctaKey)) problems.push(`dup-cta:${ctaKey}`);
      seenCTA.add(ctaKey);
    }
    if (subKey) {
      if (seenSUB.has(subKey)) problems.push(`dup-sub:${subKey}`);
      seenSUB.add(subKey);
    }

    if (ctaIssues.length || subIssues.length) {
      problems.push(`${item.slug || title}:${[...ctaIssues, ...subIssues].join(",")}`);
    }

    return {
      ...item,
      seo: { ...seo, lastVerifiedAt: now },
      verified: true,
    };
  });

  // Telemetry
  const ctas = validated.map((x) => (x.seo?.cta || "").trim());
  const subs = validated.map((x) => (x.seo?.subtitle || "").trim());
  const uniqCTA = new Set(ctas.filter(Boolean)).size;
  const uniqSUB = new Set(subs.filter(Boolean)).size;

  console.log(
    `✅ [SEO Integrity v6.1] ${validated.length} checked. ` +
      `Entropy CTA:${entropy(ctas).toFixed(2)} SUB:${entropy(subs).toFixed(2)} | ` +
      `uniqCTA=${uniqCTA}/${ctas.length} uniqSUB=${uniqSUB}/${subs.length}`
  );

  if (problems.length) {
    console.log("⚠️ SEO Integrity issues:", problems.slice(0, 25));
  }

  return validated;
}

export default { ensureSeoIntegrity };
