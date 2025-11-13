// /api/image-healer.js
// TinmanApps — Self-healing image resolver for AppSumo deals v2.0
// Finds real product images (og:image, twitter:image, JSON-LD, itemprop=image,
// or first <img> variants), then updates data/appsumo-*.json and routes images
// via /api/image-proxy to prevent raw external URLs leaking.

import fs from "fs";
import path from "path";
import url from "url";
import https from "https";
import http from "http";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

// Where we consider a "missing" image
const PLACEHOLDER_PATH = "/assets/placeholder.webp";
const DEFAULT_LIMIT = 8; // how many to heal per run across all cats

// ────────────────────────────────────────────────────────────────
// Small fetch helpers
// ────────────────────────────────────────────────────────────────
function fetchText(remoteUrl, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const client = remoteUrl.startsWith("https") ? https : http;
    let parsed;
    try {
      parsed = new URL(remoteUrl);
    } catch {
      reject(new Error("invalid-url"));
      return;
    }

    const req = client.get(parsed, (resp) => {
      if (resp.statusCode !== 200) {
        reject(new Error(`HTTP ${resp.statusCode}`));
        return;
      }
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function absolutize(base, maybe) {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

function hostSite(req) {
  const host = (req?.headers?.host || "").trim();
  const proto =
    (req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() || "https";
  if (!host) return "";
  return `${proto}://${host}`;
}

function proxifyImage(rawUrl, req) {
  const site = hostSite(req);
  if (!site || !rawUrl) return rawUrl; // last resort
  return `${site}/api/image-proxy?src=${encodeURIComponent(rawUrl)}`;
}

// ────────────────────────────────────────────────────────────────
// HTML extraction helpers
// ────────────────────────────────────────────────────────────────
function extractFromMeta(html, pageUrl) {
  const out = [];

  const metaPatterns = [
    /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/gi,
    /<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/gi,
    /<meta\s+itemprop=["']image["']\s+content=["']([^"']+)["']/gi,
  ];

  for (const re of metaPatterns) {
    for (const m of html.matchAll(re)) {
      out.push(absolutize(pageUrl, m[1]));
    }
  }

  // <link rel="image_src" href="...">
  const linkRe =
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(linkRe)) {
    out.push(absolutize(pageUrl, m[1]));
  }

  return out;
}

function extractFromJsonLd(html, pageUrl) {
  const out = [];
  const ldRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const m of html.matchAll(ldRe)) {
    const raw = m[1].trim();
    if (!raw) continue;

    try {
      const json = JSON.parse(raw);
      const bag = Array.isArray(json) ? json : [json];

      const stack = [...bag];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;

        // Push nested graph / items
        if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
        if (Array.isArray(node.itemListElement))
          stack.push(...node.itemListElement);
        if (node.mainEntity) stack.push(node.mainEntity);

        // Candidate fields
        const imgField = node.image || node.logo;
        if (typeof imgField === "string") {
          out.push(absolutize(pageUrl, imgField));
        } else if (Array.isArray(imgField) && imgField.length) {
          const first = imgField[0];
          if (typeof first === "string") {
            out.push(absolutize(pageUrl, first));
          } else if (first && typeof first === "object" && first.url) {
            out.push(absolutize(pageUrl, first.url));
          }
        } else if (imgField && typeof imgField === "object" && imgField.url) {
          out.push(absolutize(pageUrl, imgField.url));
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }

  return out;
}

function extractFromImgTags(html, pageUrl) {
  const out = [];

  // Covers src, data-src, data-original, data-lazy, data-lazy-src, data-srcset, srcset (first URL)
  const imgRe =
    /<img\b[^>]*(?:src|data-src|data-original|data-lazy|data-lazy-src|data-srcset|srcset)=["']([^"']+)["'][^>]*>/gi;

  for (const m of html.matchAll(imgRe)) {
    let candidate = m[1] || "";
    // If srcset-like, take first URL before space/comma
    if (/\s/.test(candidate) || candidate.includes(",")) {
      candidate = candidate.split(",")[0].split(/\s+/)[0].trim();
    }
    out.push(absolutize(pageUrl, candidate));
  }

  return out;
}

function filterAndRankCandidates(list) {
  const candidates = uniq(list).filter((u) =>
    /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(u || "")
  );

  // Prefer CDN-like hosts & common formats
  candidates.sort((a, b) => {
    const score = (u) =>
      (/\b(appsumo|cdn|cloudfront|static|assets)\b/i.test(u) ? 2 : 0) +
      (/\.(webp|jpe?g|jpg|png)$/i.test(u) ? 1 : 0);
    return score(b) - score(a);
  });

  return candidates;
}

// ────────────────────────────────────────────────────────────────
// Combine all discovery modes
// ────────────────────────────────────────────────────────────────
function extractImagesFromHtml(html, pageUrl) {
  const pool = [
    ...extractFromMeta(html, pageUrl),
    ...extractFromJsonLd(html, pageUrl),
    ...extractFromImgTags(html, pageUrl),
  ];

  return filterAndRankCandidates(pool);
}

// ────────────────────────────────────────────────────────────────
// Data helpers
// ────────────────────────────────────────────────────────────────
const CAT_FILES = {
  software: path.join(DATA_DIR, "appsumo-software.json"),
  marketing: path.join(DATA_DIR, "appsumo-marketing.json"),
  productivity: path.join(DATA_DIR, "appsumo-productivity.json"),
  ai: path.join(DATA_DIR, "appsumo-ai.json"),
  courses: path.join(DATA_DIR, "appsumo-courses.json"),
};

function readDeals(cat) {
  try {
    const p = CAT_FILES[cat];
    if (!p || !fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}

function writeDeals(cat, deals) {
  const p = CAT_FILES[cat];
  if (!p) return;
  fs.writeFileSync(p, JSON.stringify(deals, null, 2));
}

// Treat obvious junk / placeholder as "needs healing"
function needsHealing(entry) {
  if (!entry) return false;

  const img = (entry.image || "").trim();

  if (!img) return true;

  // If it's clearly the shared placeholder path
  try {
    const u = new URL(img, "https://x");
    if (u.pathname === PLACEHOLDER_PATH) return true;
  } catch {
    // bad URL → treat as broken
    return true;
  }

  // If it's some non-image-like token, also heal
  if (!/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(img)) return true;

  return false;
}

// ────────────────────────────────────────────────────────────────
// Fallback CDN guess for AppSumo products
// ────────────────────────────────────────────────────────────────
function guessAppsumoCdnUrl(deal) {
  const rawUrl = deal.url || deal.link || "";
  let slug = deal.slug || "";

  try {
    if (!slug && rawUrl) {
      const u = new URL(rawUrl);
      const parts = u.pathname.split("/").filter(Boolean);
      slug = parts[parts.length - 1] || slug;
    }
  } catch {
    // ignore URL errors, slug may still be present
  }

  if (!slug) return null;

  // Common AppSumo CDN pattern
  return `https://appsumo2-cdn.appsumo.com/media/products/${slug}/logo.png`;
}

// ────────────────────────────────────────────────────────────────
// Main: heal one (slug+cat) or scan all cats up to limit
// ────────────────────────────────────────────────────────────────
async function healOne({ cat, slug, req }) {
  const deals = readDeals(cat);
  const idx = deals.findIndex((d) => d.slug === slug);
  if (idx === -1) return { updated: false, reason: "not-found" };

  const deal = deals[idx];
  const pageUrl = deal.url || deal.link;

  if (!pageUrl) {
    // Fallback to a CDN guess even if we don't have a live page URL
    const guess = guessAppsumoCdnUrl(deal);
    if (!guess) return { updated: false, reason: "no-page-url" };
    const proxiedGuess = proxifyImage(guess, req);
    deals[idx] = { ...deal, image: proxiedGuess };
    writeDeals(cat, deals);
    return { updated: true, cat, slug, image: proxiedGuess, mode: "cdn-guess" };
  }

  const html = await fetchText(pageUrl, 12000);
  let imgs = extractImagesFromHtml(html, pageUrl);

  if (!imgs.length) {
    // Final fallback: slug-based CDN guess for AppSumo products
    const guess = guessAppsumoCdnUrl(deal);
    if (!guess) return { updated: false, reason: "no-image-found" };

    const proxiedGuess = proxifyImage(guess, req);
    deals[idx] = { ...deal, image: proxiedGuess };
    writeDeals(cat, deals);
    return {
      updated: true,
      cat,
      slug,
      image: proxiedGuess,
      mode: "cdn-fallback",
    };
  }

  const best = proxifyImage(imgs[0], req);
  deals[idx] = { ...deal, image: best };

  writeDeals(cat, deals);
  return { updated: true, cat, slug, image: best, mode: "html-discovery" };
}

async function healMany({ req, limit = DEFAULT_LIMIT }) {
  const report = { attempted: 0, updated: 0, items: [] };

  for (const cat of Object.keys(CAT_FILES)) {
    if (report.attempted >= limit) break;

    const deals = readDeals(cat);
    for (const d of deals) {
      if (report.attempted >= limit) break;
      if (!needsHealing(d)) continue;

      report.attempted++;
      try {
        const r = await healOne({ cat, slug: d.slug, req });
        if (r.updated) {
          report.updated++;
        }
        report.items.push(r);
      } catch (err) {
        report.items.push({
          updated: false,
          cat,
          slug: d.slug,
          error: err?.message || "error",
        });
      }
    }
  }

  return report;
}

// ────────────────────────────────────────────────────────────────
// HTTP handler
// ────────────────────────────────────────────────────────────────
export default async function imageHealer(req, res) {
  try {
    const { slug, cat, limit, dry } = req.query || {};

    // Single-target mode: ?cat=software&slug=heffl
    if (slug && cat && CAT_FILES[cat]) {
      if (dry === "1") {
        const deals = readDeals(cat);
        const hit = deals.find((d) => d.slug === slug);
        if (!hit) {
          res.status(404).json({ error: "not-found" });
          return;
        }
        if (!hit.url && !hit.link) {
          res.json({
            mode: "preview",
            cat,
            slug,
            page: null,
            candidates: [],
            note: "no-page-url",
          });
          return;
        }

        const pageUrl = hit.url || hit.link;
        const html = await fetchText(pageUrl, 12000);
        const imgs = extractImagesFromHtml(html, pageUrl);
        const fallbackGuess = guessAppsumoCdnUrl(hit);

        res.json({
          mode: "preview",
          cat,
          slug,
          page: pageUrl,
          candidates: imgs.slice(0, 5),
          cdnFallback: fallbackGuess || null,
        });
        return;
      }

      const result = await healOne({ cat, slug, req });
      res.json({ mode: "single", ...result });
      return;
    }

    // Batch mode: scan all cats up to ?limit=N
    const lim = Math.max(1, Math.min(50, Number(limit) || DEFAULT_LIMIT));
    const report = await healMany({ req, limit: lim });
    res.json({
      mode: "batch",
      limit: lim,
      ...report,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "healer-failed", detail: err?.message || "unknown" });
  }
}
