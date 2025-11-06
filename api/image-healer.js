// /api/image-healer.js
// TinmanApps — Self-healing image resolver for AppSumo deals
// Finds real product images (og:image, JSON-LD, or first <img>), then
// updates data/appsumo-*.json and routes images via /api/image-proxy

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
    const req = client.get(remoteUrl, (resp) => {
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
  if (!site) return rawUrl; // last resort
  return `${site}/api/image-proxy?src=${encodeURIComponent(rawUrl)}`;
}

// ────────────────────────────────────────────────────────────────
function extractImagesFromHtml(html, pageUrl) {
  const out = [];

  // 1) OpenGraph
  const ogRe =
    /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/gi;
  for (const m of html.matchAll(ogRe)) {
    out.push(absolutize(pageUrl, m[1]));
  }

  // 2) JSON-LD Product/ImageObject
  const ldRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(ldRe)) {
    try {
      const json = JSON.parse(m[1]);
      const bag = Array.isArray(json) ? json : [json];
      for (const node of bag) {
        const img =
          node?.image?.url ||
          (Array.isArray(node?.image) ? node.image[0] : node?.image);
        if (typeof img === "string") out.push(absolutize(pageUrl, img));
      }
    } catch {
      /* ignore */
    }
  }

  // 3) First visible <img> (src / data-* variants)
  const imgRe =
    /<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(imgRe)) {
    out.push(absolutize(pageUrl, m[1]));
  }

  // Filter obvious non-assets
  const candidates = uniq(out).filter((u) =>
    /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(u || "")
  );

  // Prefer CDN-like hosts & bigger extensions
  candidates.sort((a, b) => {
    const score = (u) =>
      (/\b(appsumo|cdn|cloudfront|static|assets)\b/i.test(u) ? 2 : 0) +
      (/\.(webp|jpg|jpeg)$/i.test(u) ? 1 : 0);
    return score(b) - score(a);
  });

  return candidates;
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

function needsHealing(entry) {
  if (!entry) return false;
  if (!entry.image) return true;
  try {
    const u = new URL(entry.image, "https://x");
    return u.pathname === PLACEHOLDER_PATH;
  } catch {
    return true;
  }
}

// ────────────────────────────────────────────────────────────────
// Main: heal one (slug+cat) or scan all cats up to limit
// ────────────────────────────────────────────────────────────────
async function healOne({ cat, slug, req }) {
  const deals = readDeals(cat);
  const idx = deals.findIndex((d) => d.slug === slug);
  if (idx === -1) return { updated: false, reason: "not-found" };

  const deal = deals[idx];
  const pageUrl = deal.url;
  const html = await fetchText(pageUrl, 12000);
  const imgs = extractImagesFromHtml(html, pageUrl);
  if (!imgs.length) return { updated: false, reason: "no-image-found" };

  const best = proxifyImage(imgs[0], req);
  deals[idx] = { ...deal, image: best };

  writeDeals(cat, deals);
  return { updated: true, cat, slug, image: best };
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
          report.items.push(r);
        }
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
        // just preview
        const deals = readDeals(cat);
        const hit = deals.find((d) => d.slug === slug);
        if (!hit) {
          res.status(404).json({ error: "not-found" });
          return;
        }
        const html = await fetchText(hit.url, 12000);
        const imgs = extractImagesFromHtml(html, hit.url);
        res.json({
          mode: "preview",
          cat,
          slug,
          page: hit.url,
          candidates: imgs.slice(0, 5),
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
    res.status(500).json({ error: "healer-failed", detail: err?.message });
  }
}
