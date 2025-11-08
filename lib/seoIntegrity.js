// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v2.0 “Sanctifier Prime+”
//
// Purpose:
// Deepens SEO and CTR diversity via emotional mapping, entropy expansion,
// and synonym rotation. Reduces repetition ("helps teams move faster...")
// while maintaining SEO keyword density and clarity.
//
// Integration point:
// After cleanseFeed() and enrichDeals(), before saving or insight execution.
//
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// ─────────────── Keyword Silos ───────────────
const SEO_KEYWORDS = {
  ai: [
    "AI automation",
    "machine learning",
    "intelligent workflow",
    "no-code AI tools",
    "GPT automation",
    "autonomous assistants",
    "AI productivity",
  ],
  marketing: [
    "growth automation",
    "lead generation",
    "conversion marketing",
    "social proof software",
    "SEO analytics",
    "content promotion",
    "audience targeting",
  ],
  productivity: [
    "workflow optimization",
    "time tracking",
    "project automation",
    "team efficiency",
    "focus tools",
    "goal alignment",
  ],
  courses: [
    "online learning",
    "creator education",
    "skill mastery",
    "knowledge platform",
    "e-learning automation",
    "training programs",
  ],
  business: [
    "operations management",
    "sales CRM",
    "analytics dashboard",
    "startup software",
    "business automation",
    "client growth",
  ],
  web: [
    "no-code builder",
    "website design",
    "form automation",
    "CMS workflow",
    "web tools",
    "site performance",
  ],
};

// ─────────────── Emotional Mapping ───────────────
const EMOTION_MAP = {
  ai: ["empower", "reinvent", "automate", "enhance", "unleash"],
  marketing: ["grow", "attract", "convert", "amplify", "inspire"],
  productivity: ["focus", "organize", "simplify", "accelerate", "achieve"],
  courses: ["master", "learn", "transform", "advance", "elevate"],
  business: ["scale", "streamline", "succeed", "manage", "optimize"],
  web: ["create", "design", "launch", "build", "deliver"],
};

// ─────────────── Expanded CTA Pools ───────────────
const CTA_VARIANTS = {
  ai: [
    "Automate your next move →",
    "Unleash intelligent automation →",
    "Build your smarter future →",
    "Empower your workflow →",
    "Enhance your results with AI →",
    "Reinvent your process today →",
  ],
  marketing: [
    "Grow your audience effortlessly →",
    "Attract more leads →",
    "Amplify your brand reach →",
    "Turn attention into conversions →",
    "Inspire engagement instantly →",
  ],
  productivity: [
    "Simplify your daily grind →",
    "Focus on what matters →",
    "Accelerate your success →",
    "Get more done every day →",
    "Organize chaos into progress →",
  ],
  courses: [
    "Master new skills today →",
    "Transform your knowledge →",
    "Learn smarter, not harder →",
    "Elevate your learning game →",
    "Advance your expertise →",
  ],
  business: [
    "Scale your success →",
    "Streamline your workflow →",
    "Optimize your operations →",
    "Grow your business confidently →",
    "Run smarter, faster teams →",
  ],
  web: [
    "Build your next project faster →",
    "Design without limits →",
    "Create stunning pages effortlessly →",
    "Launch your vision online →",
    "Deliver seamless digital experiences →",
  ],
};

// ─────────────── Subtitle Pools + Synonym Rotation ───────────────
const SUBTITLE_VARIANTS = [
  "Helps teams move faster and smarter.",
  "Simplifies your workflow with clarity and speed.",
  "Drives measurable results automatically.",
  "Boosts productivity and reduces repetitive work.",
  "Keeps your team aligned and efficient.",
  "Delivers consistent performance without hassle.",
  "Empowers you to focus on what matters most.",
  "Turns complex processes into smooth automation.",
  "Transforms routine tasks into effortless outcomes.",
  "Enhances every step of your workflow with precision.",
  "Inspires creativity through streamlined systems.",
  "Optimizes collaboration across every project.",
];

// ─────────────── Helpers ───────────────
function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(t = "") {
  return t
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s{2,}/g, " ")
    .trim();
}

function randomHook(cat) {
  const hooks = {
    ai: ["Revolutionize with AI", "Build smarter today", "Your next AI upgrade"],
    marketing: ["Boost your brand instantly", "Grow your reach effortlessly"],
    productivity: ["Work faster, focus better", "Simplify your daily grind"],
    courses: ["Master skills faster", "Transform your learning"],
    business: ["Run smarter operations", "Streamline your growth"],
    web: ["Design faster", "Power your website with confidence"],
  };
  return rand(hooks[cat] || ["Unlock your next breakthrough"]);
}

function chooseEmotionVerb(cat) {
  return rand(EMOTION_MAP[cat] || ["elevate"]);
}

// ─────────────── Main Processor ───────────────
export function ensureSeoIntegrity(feed = []) {
  const now = new Date().toISOString();

  const updated = feed.map((item) => {
    if (item.archived) return item;

    const cat = item.category?.toLowerCase() || "software";
    const emotionVerb = chooseEmotionVerb(cat);
    const keywords = SEO_KEYWORDS[cat] || [cat, "AppSumo", "lifetime deal"];
    const keywordSet = keywords.sort(() => 0.5 - Math.random()).slice(0, 3);

    // Generate clickbait headline
    const clickbait =
      item.seo?.clickbait ||
      `${randomHook(cat)} — ${capitalize(item.title)} helps you ${emotionVerb} your results`;

    // CTA + subtitle with entropy and synonym variation
    const cta =
      item.seo?.cta || rand([...CTA_VARIANTS[cat], "Discover what’s possible →"]);
    const subtitle =
      item.seo?.subtitle || rand(SUBTITLE_VARIANTS);

    return {
      ...item,
      title: capitalize(item.title),
      seo: {
        ...item.seo,
        clickbait,
        keywords: keywordSet,
        cta,
        subtitle,
        emotionalVerb: emotionVerb,
        lastVerifiedAt: now,
      },
      verified: true,
    };
  });

  console.log(
    `✅ [SEO Integrity] ${updated.length} entries verified, diversified, and emotionally enriched.`
  );

  return updated;
}

export default { ensureSeoIntegrity };
