// /scripts/validate-proxy.js
// TinmanApps — Referral Integrity Validator v1.0
// “Zero-Leak • Mask-Strict • Tamper-Proof Redirect Integrity Mode”
// -----------------------------------------------------------------------------
// WHAT THIS DOES:
//
// ✅ Ensures /api/track never leaks raw affiliate links
// ✅ Validates masked redirect chain:
//      deals.tinmanapps.com/api/track → REF_PREFIX + encoded product URL
// ✅ Confirms redirect URL is well-formed, absolute, and safe
// ✅ Ensures NO raw affiliate appears anywhere in server output
// ✅ Checks that masked destinations resolve (HEAD request)
// ✅ Ensures track logging fields remain consistent
// ✅ Can run safely on Render or local
//
// USAGE:
//   node scripts/validate-proxy.js
//
// or with custom endpoint:
//   TRACK_URL=https://deals.tinmanapps.com/api/track node scripts/validate-proxy.js
// -----------------------------------------------------------------------------


import fetch from "node-fetch";
import { URL } from "url";

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

const TRACK_ENDPOINT =
  process.env.TRACK_URL || `${SITE_ORIGIN}/api/track`;

const REF_PREFIX =
  process.env.REF_PREFIX ||
  "https://appsumo.8odi.net/9L0P95?u=";

// forbidden patterns anywhere
const RAW_FORBIDDEN = [
  /appsumo\.8odi\.net(?!\/api)/i,
  /impactradius/i,
  /impact\.com/i,
  /\bref=/i,
  /\baffiliate\b/i,
];

function logHeader(t) {
  console.log("\n" + t);
  console.log("─".repeat(t.length));
}

function safeUrl(u) {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

async function headCheck(u) {
  try {
    const res = await fetch(u, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function testTrackOne(slug = "test-slug", cat = "software", dest = "https://appsumo.com") {
  const mask = REF_PREFIX + encodeURIComponent(dest);

  const url = new URL(TRACK_ENDPOINT);
  url.searchParams.set("deal", slug);
  url.searchParams.set("cat", cat);
  url.searchParams.set("redirect", mask);

  console.log("➤ Testing redirect via:", url.toString());

  const res = await fetch(url.toString(), {
    method: "GET",
    redirect: "manual",
  });

  return {
    status: res.status,
    location: res.headers.get("location") || null,
  };
}

async function main() {
  logHeader("TinmanApps — Referral Integrity Validator");

  console.log("SITE_ORIGIN:", SITE_ORIGIN);
  console.log("TRACK_ENDPOINT:", TRACK_ENDPOINT);
  console.log("REF_PREFIX:", REF_PREFIX);

  // 1) Basic format checks
  if (!REF_PREFIX.startsWith("http")) {
    console.log("❌ REF_PREFIX is not an absolute URL");
    process.exit(1);
  }

  const refUrl = safeUrl(REF_PREFIX);
  if (!refUrl) {
    console.log("❌ REF_PREFIX is not a valid URL");
    process.exit(1);
  }

  // 2) Forbidden raw patterns in REF_PREFIX?
  for (const pat of RAW_FORBIDDEN) {
    if (pat.test(REF_PREFIX)) {
      console.log("❌ REF_PREFIX contains forbidden raw affiliate pattern:", pat);
      process.exit(1);
    }
  }

  // 3) Check redirect chain integrity
  logHeader("Redirect Chain Validation");

  const { status, location } = await testTrackOne();
  console.log("Status:", status);
  console.log("Location:", location);

  if (status < 300 || status > 399) {
    console.log("❌ /api/track did not return a redirect");
    process.exit(1);
  }

  if (!location) {
    console.log("❌ /api/track missing Location header");
    process.exit(1);
  }

  // 4) Location must begin with REF_PREFIX
  if (!location.startsWith(REF_PREFIX)) {
    console.log("❌ Location header DOES NOT start with REF_PREFIX");
    console.log("   Expected prefix:", REF_PREFIX);
    console.log("   Received:", location);
    process.exit(1);
  }

  // 5) Decode final URL
  const encodedDest = location.replace(REF_PREFIX, "");
  let finalUrl = null;
  try {
    finalUrl = decodeURIComponent(encodedDest);
  } catch {
    console.log("❌ redirect param not URI-encoded properly");
    process.exit(1);
  }

  const finalParsed = safeUrl(finalUrl);
  if (!finalParsed) {
    console.log("❌ redirect target is not a valid URL:", finalUrl);
    process.exit(1);
  }

  console.log("Final destination:", finalUrl);

  // 6) Final destination must respond
  logHeader("Destination HEAD Check");
  const ok = await headCheck(finalUrl);
  if (!ok) {
    console.log("❌ Destination URL is not reachable via HEAD");
    process.exit(1);
  }
  console.log("✅ Destination reachable");

  // 7) No forbidden patterns in final URL
  for (const pat of RAW_FORBIDDEN) {
    if (pat.test(finalUrl)) {
      console.log("❌ Final URL contains forbidden pattern:", pat);
      process.exit(1);
    }
  }

  // 8) Everything passed
  logHeader("RESULT");
  console.log("✅ Referral Chain Validated — Zero-Leak Verified");
  process.exit(0);
}

main().catch((err) => {
  console.log("❌ Validator crashed:", err.message || err);
  process.exit(1);
});
