// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v7.0 “Hybrid Repair Sentinel”
// “Validation + Auto-Repair • CTA v11.3 Alignment • Two-Sentence SEO Guardrail”
//
// v7.0 Upgrades (Hybrid Repair Mode — Option C)
// • Still validates CTA/subtitle structure against CTA Engine v11.x rules
// • Adds SOFT REPAIR: grammar polish, arrow/ending normalisation, length clamps
// • Adds HARD REPAIR fallback: deterministic regeneration from CTA clusters
// • Subtitle: enforces true two-sentence structure with category lexicon injection
// • All repairs are *deterministic* (sha1-based), no runtime randomness
//
// Strict behavioural guarantees:
//   ✔ Always returns CTA/subtitle that pass structure sanity (or best-effort repaired)
//   ✔ Never throws on malformed input; every broken CTA/subtitle is either repaired
//     or regenerated deterministically
//   ✔ Adds integrity metadata (seo.integrity) for debugging
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// CTA v11.x category clusters — MUST MATCH /lib/ctaEngine.js VERBS/OBJECTS
const CTA_CLUSTERS = {
  ai: {
    verbs: ["Automate", "Simplify", "Enhance", "Optimize", "Scale", "Accelerate"],
    objects: [
      "AI workflow",
      "agent tasks",
      "smart automation",
      "prompt chains",
      "model outputs",
      "AI stack",
      "AI processes",
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
      "funnel performance",
      "SEO impact",
    ],
  },
  productivity: {
    verbs: ["Simplify", "Organize", "Streamline", "Accelerate", "Focus", "Refine"],
    objects: ["daily work", "task lists", "team output", "workflow", "routine", "day-to-day work"],
  },
  business: {
    verbs: ["Streamline", "Enhance", "Automate", "Improve", "Elevate", "Align"],
    objects: [
      "operations",
      "client management",
      "sales systems",
      "reporting",
      "execution",
      "revops",
    ],
  },
  courses: {
    verbs: ["Learn", "Master", "Advance", "Level-up", "Accelerate", "Develop"],
    objects: ["skills", "knowledge", "career", "expertise", "learning path", "creator education"],
  },
  web: {
    verbs: ["Build", "Launch", "Design", "Optimize", "Enhance", "Deploy"],
    objects: [
      "website",
      "landing pages",
      "UX",
      "frontend workflow",
      "design system",
      "site structure",
    ],
  },
  ecommerce: {
    verbs: ["Increase", "Boost", "Simplify", "Optimize", "Enhance", "Grow"],
    objects: [
      "sales",
      "checkout flow",
      "store performance",
      "customer journey",
      "order value",
    ],
  },
  creative: {
    verbs: ["Create", "Design", "Elevate", "Refine", "Polish", "Reimagine"],
    objects: ["visuals", "content", "media", "creative assets", "brand visuals"],
  },
  software: {
    verbs: ["Simplify", "Optimize", "Automate", "Enhance", "Improve", "Scale"],
    objects: ["workflow", "systems", "stack", "processes", "deployment", "tooling"],
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
  return crypto.createHash("sha1").update(String(s || "")).digest("hex");
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

function clamp(str, n) {
  const s = String(str || "").trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n).replace(/\s+\S*$/, "");
  return (cut || s.slice(0, n)).trim() + "…";
}

function titleCore(t = "") {
  return String(t || "").split(/[:\-|]/)[0].trim();
}

function cleanSpaces(t = "") {
  return String(t || "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

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

  return cleanSpaces(cta);
}

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

// Deterministic pick from cluster
function stablePick(clusterKey, slug, salt, list = []) {
  if (!list.length) return "";
  const seed = `${clusterKey}::${slug || ""}::${salt}`;
  const h = sha1(seed).slice(0, 8);
  const idx = parseInt(h, 16) % list.length;
  return list[idx];
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA VALIDATOR (v11.x grammar-aware)
// Expected *ideal* pattern from engine:
//   {Verb} your {object} with {Brand} {ending}
// but we validate "around" this pattern; we do not require it literally.
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
// CTA REPAIR (Hybrid Mode: Soft repair → Hard regen if still broken)
// ───────────────────────────────────────────────────────────────────────────────
function softRepairCta(ctaRaw = "", category = "software", title = "") {
  let cta = cleanSpaces(ctaRaw || "");

  // Grammar polish & seam cleaning
  cta = grammarPolishCta(cta);

  // Ensure we have a valid ending; if not, normalise to "→"
  if (!findEnding(cta)) {
    // Strip any trailing junk arrows/symbols and re-append clean arrow
    cta = cta.replace(/[\s\-–—]*→\s*$/g, "").trim();
    cta = `${cta} →`.trim();
  }

  // Clamp to 64 chars
  cta = clamp(cta, 64);

  // Ensure not empty after cleaning
  if (!cta.trim()) {
    const core = titleCore(title) || "this tool";
    cta = `Improve your workflow with ${core} →`;
  }

  return cleanSpaces(cta);
}

function regenerateCta(category = "software", title = "", slug = "") {
  const cat = stableCat(category);
  const cluster = CTA_CLUSTERS[cat] || CTA_CLUSTERS.software;
  const brandCore = titleCore(title) || "this tool";

  const verb =
    stablePick(cat, slug, "verb", cluster.verbs) ||
    stablePick("software", slug, "verb", CTA_CLUSTERS.software.verbs) ||
    "Improve";

  const object =
    stablePick(cat, slug, "object", cluster.objects) ||
    stablePick("software", slug, "object", CTA_CLUSTERS.software.objects) ||
    "workflow";

  const endings = CTA_ENDINGS;
  const end = stablePick(cat, slug, "end", endings) || "→";

  let cta = `${verb} your ${object} with ${brandCore} ${end}`;
  cta = grammarPolishCta(cta);
  cta = clamp(cta, 64);
  return cleanSpaces(cta);
}

function repairCtaHybrid(ctaRaw, category, title, slug) {
  const initialIssues = validateCtaV11(ctaRaw, category, title);
  if (!initialIssues.length) {
    return { cta: ctaRaw || "", mode: "original", issues: [] };
  }

  // 1) Soft repair
  const soft = softRepairCta(ctaRaw || "", category, title);
  const softIssues = validateCtaV11(soft, category, title);

  const hardRequired = softIssues.some((code) =>
    [
      "cta-missing",
      "cta-invalid-verb",
      "cta-missing-object",
      "cta-no-verb-detected",
      "cta-bad-ending",
      "cta-missing-brand-after-with",
    ].includes(code)
  );

  if (!hardRequired) {
    return { cta: soft, mode: "soft-repair", issues: softIssues };
  }

  // 2) Hard regen (deterministic)
  const regen = regenerateCta(category, title, slug);
  const regenIssues = validateCtaV11(regen, category, title);
  return { cta: regen, mode: "regen", issues: regenIssues };
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
// Subtitle repair (Hybrid: soft structure fix → regen if needed)
// ───────────────────────────────────────────────────────────────────────────────
function softRepairSubtitle(subRaw = "", title = "", category = "software") {
  let sub = cleanSpaces(subRaw || "");
  const cat = stableCat(category);
  const lex = KEYWORDS[cat] || KEYWORDS.software;
  const lexPhrase =
    lex[parseInt(sha1(`${cat}::${title}::lex`).slice(0, 8), 16) % lex.length];

  // Ensure first character is uppercase letter if alpha
  if (sub && /^[a-z]/.test(sub)) {
    sub = sub[0].toUpperCase() + sub.slice(1);
  }

  // Basic sentence segmentation
  let segments = sub
    .split(/[.!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    // pure fallback
    const brand = titleCore(title) || "This tool";
    segments = [
      `${brand} helps ${lexPhrase.toLowerCase()} with an intuitive workflow`,
      "Focuses on practical outcomes to drive measurable gains",
    ];
  } else if (segments.length === 1) {
    // add second sentence with category lexicon
    const brand = titleCore(title) || "This tool";
    const s1 = segments[0];
    const s2 = `${brand} focuses on ${lexPhrase.toLowerCase()} to drive measurable gains`;
    segments = [s1, s2];
  } else if (segments.length > 2) {
    // keep first two sentences only
    segments = segments.slice(0, 2);
  }

  // Rebuild with periods
  sub = `${segments[0].replace(/[.!?]+$/g, "")}. ${segments[1].replace(
    /[.!?]+$/g,
    ""
  )}.`;

  // Clamp
  sub = clamp(sub, 160);
  return cleanSpaces(sub);
}

function regenerateSubtitle(title = "", category = "software", slug = "") {
  const cat = stableCat(category);
  const lex = KEYWORDS[cat] || KEYWORDS.software;
  const lexPhrase =
    lex[parseInt(sha1(`${cat}::${slug}::subtitle-lex`).slice(0, 8), 16) % lex.length];

  const brandCore = titleCore(title) || "This tool";

  const intro = `${brandCore} helps ${lexPhrase.toLowerCase()} with an intuitive approach.`;
  const s2 = "Focuses on practical outcomes to drive measurable gains.";

  let sub = `${intro} ${s2}`;
  sub = clamp(sub, 160);
  return cleanSpaces(sub);
}

function repairSubtitleHybrid(subRaw, title, category, slug) {
  const initialIssues = validateSubtitle(subRaw, title, category);
  if (!initialIssues.length) {
    return { subtitle: subRaw || "", mode: "original", issues: [] };
  }

  // 1) Soft repair
  const soft = softRepairSubtitle(subRaw || "", title, category);
  const softIssues = validateSubtitle(soft, title, category);

  const hardRequired = softIssues.some((code) =>
    [
      "subtitle-missing",
      "subtitle-not-two-sentences",
      "subtitle-missing-lexicon",
      "subtitle-missing-product-name",
    ].includes(code)
  );

  if (!hardRequired) {
    return { subtitle: soft, mode: "soft-repair", issues: softIssues };
  }

  // 2) Hard regen
  const regen = regenerateSubtitle(title, category, slug);
  const regenIssues = validateSubtitle(regen, title, category);
  return { subtitle: regen, mode: "regen", issues: regenIssues };
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN — ensureSeoIntegrity(feed)
// Hybrid Mode: validate + auto-repair CTA/subtitle before returning.
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
    const slug = item.slug || "";
    const seo = item.seo || {};

    const originalCta = (seo.cta || "").trim();
    const originalSub = (seo.subtitle || "").trim();

    // CTA hybrid repair
    const ctaRepair = repairCtaHybrid(originalCta, cat, title, slug);

    // Subtitle hybrid repair
    const subRepair = repairSubtitleHybrid(originalSub, title, cat, slug);

    const finalCta = ctaRepair.cta;
    const finalSub = subRepair.subtitle;

    const ctaIssues = validateCtaV11(finalCta, cat, title);
    const subIssues = validateSubtitle(finalSub, title, cat);

    const ctaKey = finalCta.trim();
    const subKey = finalSub.trim();

    // Duplication detection
    if (ctaKey) {
      if (seenCTA.has(ctaKey)) problems.push(`dup-cta:${ctaKey}`);
      seenCTA.add(ctaKey);
    }
    if (subKey) {
      if (seenSUB.has(subKey)) problems.push(`dup-sub:${subKey}`);
      seenSUB.add(subKey);
    }

    const issueList = [...new Set([...ctaIssues, ...subIssues])];
    if (issueList.length) {
      problems.push(`${slug || title}:${issueList.join(",")}`);
    }

    return {
      ...item,
      seo: {
        ...seo,
        cta: finalCta,
        subtitle: finalSub,
        lastVerifiedAt: now,
        integrity: {
          ctaMode: ctaRepair.mode,
          subtitleMode: subRepair.mode,
          ctaIssues,
          subtitleIssues: subIssues,
        },
      },
      verified: true,
    };
  });

  // Telemetry
  const ctas = validated.map((x) => (x.seo?.cta || "").trim());
  const subs = validated.map((x) => (x.seo?.subtitle || "").trim());
  const uniqCTA = new Set(ctas.filter(Boolean)).size;
  const uniqSUB = new Set(subs.filter(Boolean)).size;

  console.log(
    `✅ [SEO Integrity v7.0] ${validated.length} checked + repaired. ` +
      `Entropy CTA:${entropy(ctas).toFixed(2)} SUB:${entropy(subs).toFixed(2)} | ` +
      `uniqCTA=${uniqCTA}/${ctas.length} uniqSUB=${uniqSUB}/${subs.length}`
  );

  if (problems.length) {
    console.log("⚠️ SEO Integrity issues (post-repair):", problems.slice(0, 25));
  }

  return validated;
}

export default { ensureSeoIntegrity };
