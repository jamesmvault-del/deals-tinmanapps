// /lib/feedNormalizer.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Semantic Repair Layer v1.0 “Sanctifier”
//
// Purpose:
// Cleans, deduplicates, and semantically categorizes incoming AppSumo feed data
// before enrichment. Guarantees consistent structure for downstream CTA/SEO
// engines.
//
// Key Features:
// • Repairs malformed titles (slug-like or null)
// • Ensures every entry has { title, slug, category, seo }
// • Infers categories via keyword clusters
// • Deduplicates and timestamps normalized entries
// • Non-destructive: preserves existing SEO metadata if present
// ───────────────────────────────────────────────────────────────────────────────

import path from "path";
import fs from "fs";

// ─────────────── Category Keyword Clusters ───────────────
const CATEGORY_KEYWORDS = {
  ai: [
    "ai",
    "artificial intelligence",
    "assistant",
    "automation",
    "generator",
    "chatbot",
    "prompt",
    "gpt",
    "openai",
    "ml",
    "machine learning",
  ],
  marketing: [
    "seo",
    "email",
    "leads",
    "crm",
    "marketing",
    "advertising",
    "analytics",
    "traffic",
    "social",
    "campaign",
  ],
  productivity: [
    "time",
    "task",
    "schedule",
    "calendar",
    "organize",
    "focus",
    "reminder",
    "project",
    "workflow",
    "team",
  ],
  software: [
    "tool",
    "app",
    "software",
    "system",
    "automation",
    "integration",
    "dashboard",
  ],
  business: [
    "agency",
    "sales",
    "analytics",
    "crm",
    "client",
    "operation",
    "pipeline",
    "report",
    "data",
  ],
  web: [
    "website",
    "form",
    "wordpress",
    "page",
    "site",
    "landing",
    "builder",
    "design",
  ],
  ecommerce: [
    "shop",
    "store",
    "checkout",
    "cart",
    "sale",
    "product",
    "commerce",
  ],
  courses: [
    "course",
    "learning",
    "tutorial",
    "academy",
    "training",
    "education",
    "teach",
    "lesson",
  ],
  creative: [
    "design",
    "graphics",
    "template",
    "content",
    "creator",
    "visual",
    "notion",
    "branding",
  ],
};

// ─────────────── Utility Helpers ───────────────
const slugify = (t = "") =>
  t
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

const capitalizeTitle = (t = "") =>
  t
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s{2,}/g, " ")
    .trim();

function detectCategory(text = "") {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return "software";
}

// ─────────────── Main Normalizer ───────────────
export function normalizeFeed(rawFeed = []) {
  const seen = new Set();
  const now = new Date().toISOString();

  const normalized = rawFeed
    .map((item) => {
      if (!item) return null;

      // 1️⃣ Title repair
      let title =
        item.title ||
        item.name ||
        item.slug?.replace(/[-_]/g, " ") ||
        "Untitled";
      title = capitalizeTitle(title);

      // 2️⃣ Slug generation
      let slug = item.slug || slugify(item.title || title);
      if (!slug) slug = slugify(title);

      // 3️⃣ Category inference
      const category =
        item.category || detectCategory(`${title} ${item.description || ""}`);

      // 4️⃣ SEO preservation
      const seo =
        item.seo && typeof item.seo === "object"
          ? {
              cta: item.seo.cta ?? null,
              subtitle: item.seo.subtitle ?? null,
            }
          : { cta: null, subtitle: null };

      // 5️⃣ Link preservation
      const link = item.link || item.url || item.product_url || null;

      // 6️⃣ Compose normalized entry
      return {
        title,
        slug,
        category,
        link,
        seo,
        normalizedAt: now,
      };
    })
    .filter(Boolean)
    .filter((v) => {
      // 7️⃣ Deduplication by slug or title
      const key = v.slug.toLowerCase() + "::" + v.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  console.log(`✅ [FeedNormalizer] Normalized ${normalized.length} entries`);
  return normalized;
}

// ─────────────── Optional Batch Utility ───────────────
export function normalizeFeedFile(feedPath = path.resolve("./data/feed-cache.json")) {
  if (!fs.existsSync(feedPath)) {
    console.warn("⚠️ [FeedNormalizer] feed-cache.json not found, skipping");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(feedPath, "utf8"));
  const normalized = normalizeFeed(raw);
  fs.writeFileSync(feedPath, JSON.stringify(normalized, null, 2), "utf8");
  console.log("✅ [FeedNormalizer] Feed cache normalized and saved");
}

export default { normalizeFeed, normalizeFeedFile };
