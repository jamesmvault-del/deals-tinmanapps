// /scripts/html-snapshot.js
// TinmanApps — HTML Snapshot Generator v1.0
// “Deterministic • Render-Safe • SEO-Integrity Capture”
// -----------------------------------------------------------------------------
// • Fetches all dynamic category pages + home page
// • Saves static HTML snapshots under /snapshots/
// • Normalises output (removes timestamps, cache headers, runtime artefacts)
// • Safe to run locally or on Render
// • Used by validate-html.js for structural consistency checks
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT_DIR = path.join(ROOT, "snapshots");

// Ensure directory exists
if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  console.log(`✅ Created snapshot directory: ${SNAPSHOT_DIR}`);
}

// Origin of deployed site
const ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

// Dynamic routes to capture
const ROUTES = [
  "/", // home
  "/categories/ai",
  "/categories/software",
  "/categories/marketing",
  "/categories/productivity",
  "/categories/courses",
  "/categories/business",
  "/categories/web",
  "/categories/ecommerce",
  "/categories/creative",
];

// Normalisation to keep output stable between runs
function normalise(html = "") {
  return String(html)
    // Strip timestamps
    .replace(/20\d{2}[-/]\d{2}[-/]\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/g, "")
    // Remove random querystrings (?cachebuster)
    .replace(/\?v=\w+/g, "")
    // Collapse excessive whitespace
    .replace(/\s{2,}/g, " ")
    // Trim edges
    .trim();
}

async function fetchRoute(route) {
  const url = `${ORIGIN}${route}`;
  try {
    console.log(`→ Fetching ${url}`);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "TinmanApps HTML Snapshot Bot",
      },
    });

    if (!res.ok) {
      console.warn(`⚠️ Failed (${res.status}) for ${route}`);
      return null;
    }

    const raw = await res.text();
    return normalise(raw);
  } catch (err) {
    console.error(`❌ Fetch error for ${route}:`, err.message);
    return null;
  }
}

async function run() {
  console.log("📸 Generating HTML snapshots…\n");

  for (const route of ROUTES) {
    const snap = await fetchRoute(route);
    if (!snap) continue;

    const name =
      route === "/"
        ? "home.html"
        : route.replace("/categories/", "") + ".html";

    const out = path.join(SNAPSHOT_DIR, name);

    try {
      fs.writeFileSync(out, snap, "utf8");
      console.log(`✅ Saved snapshot → ${out}`);
    } catch (err) {
      console.error(`❌ Failed to write ${out}:`, err.message);
    }
  }

  console.log("\n🎉 Snapshot generation complete.");
}

run();
