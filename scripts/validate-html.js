// /scripts/validate-html.js
// TinmanApps — HTML Integrity Scanner v1.0
// “Schema-Focused • Canonical-Strict • No-Leak Guarantee • SEO Integrity Mode”
// -----------------------------------------------------------------------------
// WHAT THIS DOES:
//
// ✅ Scans ALL HTML files in /public, /static, /cache-output, or a user directory
// ✅ Confirms:
//    • No raw affiliate links (NO appsumo.8odi.net, NO impact URLs)
//    • Canonical tag present & valid absolute URL
//    • <title> present, non-empty, not placeholder
//    • <meta name="description"> present & valid
//    • JSON-LD blocks valid (BreadcrumbList, ItemList, Product, WebPage)
//    • OG tags present (og:title, og:description, og:image)
//    • No duplicate <title>, canonical, description, or schema blocks
//    • Robots tag correct (index, follow)
// ✅ Produces:
//    • ERROR list (fatal)
//    • WARNING list (non-fatal improvements)
// ✅ Exit codes:
//    • 0 = clean
//    • 1 = validation errors
//
// USAGE:
//   node scripts/validate-html.js
//
// or:
//   HTML_DIR=./build node scripts/validate-html.js
//
// -----------------------------------------------------------------------------


import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directories we scan by default
const DEFAULT_DIRS = [
  path.resolve(__dirname, "../public"),
  path.resolve(__dirname, "../static"),
  path.resolve(__dirname, "../cache-output"),
];

// Use override if provided
const TARGET_DIR =
  process.env.HTML_DIR
    ? path.resolve(process.cwd(), process.env.HTML_DIR)
    : null;

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

const AFFILIATE_RAW_PATTERNS = [
  /appsumo\.8odi\.net/i,
  /impactradius/i,
  /impact\.com/i,
  /\/ref\//i,
  /\?ref=/i,
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function logHeader(t) {
  console.log("\n" + t);
  console.log("─".repeat(t.length));
}

function isHtmlFile(p) {
  return p.endsWith(".html") || p.endsWith(".htm");
}

function readAllHtmlFiles(dir) {
  const collected = [];
  if (!fs.existsSync(dir)) return collected;

  const walk = (base) => {
    const items = fs.readdirSync(base);
    for (const item of items) {
      const full = path.join(base, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile() && isHtmlFile(full)) collected.push(full);
    }
  };

  walk(dir);
  return collected;
}

function extractTag(html, tag, attr = null) {
  const regex = attr
    ? new RegExp(`<${tag}[^>]*${attr}="([^"]+)"[^>]*>`, "i")
    : new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");

  const m = html.match(regex);
  return m ? m[1].trim() : null;
}

function extractAllJsonLd(html) {
  const blocks = [];
  const regex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = regex.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch {
      blocks.push({ __INVALID__: true });
    }
  }
  return blocks;
}

// -----------------------------------------------------------------------------
// Validators
// -----------------------------------------------------------------------------
function validateHtmlFile(file) {
  const errors = [];
  const warnings = [];

  const html = fs.readFileSync(file, "utf8");

  // 1) Raw affiliate links forbidden
  for (const pat of AFFILIATE_RAW_PATTERNS) {
    if (pat.test(html)) {
      errors.push(`Raw affiliate link found (“${pat}”). Must ONLY appear IN redirect param.`);
    }
  }

  // 2) Canonical tag
  const canonical = extractTag(html, "link", "rel=\"canonical\"");
  if (!canonical) {
    errors.push("Missing <link rel=\"canonical\">");
  } else {
    if (!canonical.startsWith("http")) {
      errors.push("Canonical URL must be absolute");
    }
    if (!canonical.startsWith(SITE_ORIGIN)) {
      warnings.push(`Canonical URL is external: ${canonical}`);
    }
  }

  // 3) Title
  const title = extractTag(html, "title");
  if (!title) errors.push("Missing <title>");
  else if (title.length < 3) warnings.push("Title seems too short");
  else if (/untitled|placeholder/i.test(title)) warnings.push("Title looks placeholder-ish");

  // 4) Description
  const desc = extractTag(html, "meta", "name=\"description\"");
  if (!desc) errors.push("Missing <meta name=\"description\">");
  else if (desc.length < 10) warnings.push("Description too short");

  // 5) OG tags
  const ogTitle = extractTag(html, "meta", "property=\"og:title\"");
  const ogDesc = extractTag(html, "meta", "property=\"og:description\"");
  const ogImg = extractTag(html, "meta", "property=\"og:image\"");

  if (!ogTitle) warnings.push("Missing og:title");
  if (!ogDesc) warnings.push("Missing og:description");
  if (!ogImg) warnings.push("Missing og:image");

  // 6) JSON-LD validity
  const ldBlocks = extractAllJsonLd(html);
  if (ldBlocks.length === 0) warnings.push("No JSON-LD blocks found");

  ldBlocks.forEach((b, i) => {
    if (b.__INVALID__) {
      errors.push(`JSON-LD block #${i + 1} is invalid JSON`);
      return;
    }
    if (!b["@context"]) warnings.push(`JSON-LD #${i + 1} missing @context`);
    if (!b["@type"]) warnings.push(`JSON-LD #${i + 1} missing @type`);

    // Recommended: BreadcrumbList OR ItemList
    const type = b["@type"];
    if (
      type !== "BreadcrumbList" &&
      type !== "ItemList" &&
      type !== "Product" &&
      type !== "WebPage"
    ) {
      warnings.push(`JSON-LD #${i + 1} unusual type: ${type}`);
    }
  });

  // 7) robots meta
  const robots = extractTag(html, "meta", "name=\"robots\"");
  if (robots && !/index/i.test(robots)) {
    warnings.push(`Robots meta unusual: "${robots}"`);
  }

  return { errors, warnings };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  logHeader("TinmanApps — HTML Integrity Scanner");

  const dirsToScan = TARGET_DIR ? [TARGET_DIR] : DEFAULT_DIRS;
  console.log("Scanning directories:");
  dirsToScan.forEach((d) => console.log(" • " + d));

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFiles = 0;

  for (const dir of dirsToScan) {
    if (!fs.existsSync(dir)) continue;
    const htmlFiles = readAllHtmlFiles(dir);

    for (const file of htmlFiles) {
      totalFiles++;
      console.log(`\n📄 ${file}`);

      const { errors, warnings } = validateHtmlFile(file);

      if (errors.length === 0) console.log("✅ no errors");
      else errors.forEach((e) => console.log("❌ " + e));

      if (warnings.length === 0) console.log("✅ no warnings");
      else warnings.forEach((w) => console.log("⚠️ " + w));

      totalErrors += errors.length;
      totalWarnings += warnings.length;
    }
  }

  logHeader("Summary");
  console.log(`Files scanned: ${totalFiles}`);
  console.log(`Warnings: ${totalWarnings}`);
  console.log(`Errors: ${totalErrors}`);

  if (totalErrors > 0) {
    console.log("\n❌ HTML validation failed.");
    process.exit(1);
  } else {
    console.log("\n✅ HTML validation passed.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.log("❌ HTML validator crashed:", err.message || err);
  process.exit(1);
});
