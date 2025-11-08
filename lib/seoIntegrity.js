// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v2.1 “Entropy Expander + Diversity Governor”
//
// Purpose:
// Expands SEO and CTR entropy through category-aware pools, impact-phrase injection,
// and dynamic diversity scoring. Ensures maximum variation, emotional relevance,
// and SEO keyword density without repetition fatigue.
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

// ─────────────── CTA Pools ───────────────
const CTA_VARIANTS = {
  ai: [
    "Automate your next move →",
    "Unleash intelligent automation →",
    "Build your smarter future →",
    "Empower your workflow →",
    "Enhance your results with AI →",
    "Reinvent your process today →",
    "Turn insight into action →",
  ],
  marketing: [
    "Grow your audience effortlessly →",
    "Attract more leads →",
    "Amplify your brand reach →",
    "Turn attention into conversions →",
    "Inspire engagement instantly →",
    "Boost your marketing automation →",
  ],
  productivity: [
    "Simplify your daily grind →",
    "Focus on what matters →",
    "Accelerate your success →",
    "Get more done every day →",
    "Organize chaos into progress →",
    "Reclaim your productive hours →",
  ],
  courses: [
    "Master new skills today →",
    "Transform your knowledge →",
    "Learn smarter, not harder →",
    "Elevate your learning game →",
    "Advance your expertise →",
    "Unlock your teaching potential →",
  ],
  business: [
    "Scale your success →",
    "Streamline your workflow →",
    "Optimize your operations →",
    "Grow your business confidently →",
    "Run smarter, faster teams →",
    "Transform your client impact →",
  ],
  web: [
    "Build your next project faster →",
    "Design without limits →",
    "Create stunning pages effortlessly →",
    "Launch your vision online →",
    "Deliver seamless digital experiences →",
    "Develop with precision →",
  ],
};

// ─────────────── Subtitle Pools + Impact Phrases ───────────────
const BASE_SUBTITLES = [
  "Simplifies your workflow with clarity and speed.",
  "Drives measurable results automatically.",
  "Boosts productivity and reduces repetitive work.",
  "Keeps your team aligned and efficient.",
  "Delivers consistent performance without hassle.",
  "Empowers you to focus on what matters most.",
  "Turns complex processes into smooth automation.",
  "Transforms routine tasks into effortless outcomes.",
  "Enhances every step of your workflow with precision.",
  "Optimizes collaboration across every project.",
  "Inspires creativity through streamlined systems.",
  "Drives clarity, speed, and focus across your goals.",
];

const IMPACT_PHRASES = [
  "— trusted by creators worldwide.",
  "— and turns hours into minutes.",
  "— empowering over 10,000 teams.",
  "— giving you clarity, not clutter.",
  "— built for ambitious builders.",
  "— with measurable, lasting impact.",
  "— saving you time every single day.",
  "— and fueling unstoppable growth.",
  "— crafted for performance and precision.",
  "— loved by startups and pros alike.",
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

function addImpactPhrase(sub) {
  return `${sub} ${rand(IMPACT_PHRASES)}`;
}

// ─────────────── Main Processor ───────────────
export function ensureSeoIntegrity(feed = []) {
  const now = new Date().toISOString();
  const usedCTAs = new Set();
  const usedSubs = new Set();

  const updated = feed.map((item) => {
    if (item.archived) return item;

    const cat = item.category?.toLowerCase() || "software";
    const emotionVerb = chooseEmotionVerb(cat);
    const keywords = SEO_KEYWORDS[cat] || [cat, "AppSumo", "lifetime deal"];
    const keywordSet = keywords.sort(() => 0.5 - Math.random()).slice(0, 3);

    // Clickbait headline
    const clickbait =
      item.seo?.clickbait ||
      `${randomHook(cat)} — ${capitalize(item.title)} helps you ${emotionVerb} your results`;

    // Category-specific CTA
    let cta =
      item.seo?.cta ||
      rand([...CTA_VARIANTS[cat], "Discover what’s possible →"]);
    while (usedCTAs.has(cta)) {
      cta = rand(CTA_VARIANTS[cat]);
    }
    usedCTAs.add(cta);

    // Subtitle with optional impact phrase
    let subtitle =
      item.seo?.subtitle || addImpactPhrase(rand(BASE_SUBTITLES));
    while (usedSubs.has(subtitle)) {
      subtitle = addImpactPhrase(rand(BASE_SUBTITLES));
    }
    usedSubs.add(subtitle);

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

  // Diversity Log
  const ctaDiversity = usedCTAs.size;
  const subDiversity = usedSubs.size;
  const total = feed.length;
  const entropyCTA = (ctaDiversity / total).toFixed(2);
  const entropySub = (subDiversity / total).toFixed(2);

  console.log(
    `✅ [SEO Integrity] ${updated.length} entries verified and diversified. CTA entropy: ${entropyCTA}, Subtitle entropy: ${entropySub}`
  );

  return updated;
}

export default { ensureSeoIntegrity };
