// /api/image-proxy.js
// TinmanApps — Intelligent image proxy & fallback system

import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "../data/image-cache");
const PLACEHOLDER = path.join(__dirname, "../public/assets/placeholder.webp");

// Ensure cache folder exists
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
function fetchRemoteImage(remoteUrl) {
  return new Promise((resolve, reject) => {
    const client = remoteUrl.startsWith("https") ? https : http;
    client
      .get(remoteUrl, (resp) => {
        if (resp.statusCode !== 200) {
          reject(new Error(`HTTP ${resp.statusCode}`));
          return;
        }
        const chunks = [];
        resp.on("data", (chunk) => chunks.push(chunk));
        resp.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject)
      .setTimeout(7000, () => reject(new Error("timeout")));
  });
}

// ────────────────────────────────────────────────────────────────
// Main proxy handler
// ────────────────────────────────────────────────────────────────
export default async function imageProxy(req, res) {
  const src = req.query.src;
  if (!src) {
    res.status(400).send("Missing src parameter");
    return;
  }

  try {
    const urlObj = new URL(src);
    const slug = path.basename(urlObj.pathname).replace(/[^a-zA-Z0-9._-]/g, "");
    const cachePath = path.join(CACHE_DIR, slug);

    // Serve cached if available
    if (fs.existsSync(cachePath)) {
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(fs.readFileSync(cachePath));
      return;
    }

    // Attempt to fetch remote
    const buf = await fetchRemoteImage(src);

    // Cache result
    fs.writeFileSync(cachePath, buf);
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Image-Reason", "live");
    res.send(buf);
  } catch (err) {
    // Fallback to placeholder
    try {
      const ph = fs.readFileSync(PLACEHOLDER);
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("X-Image-Reason", "placeholder");
      res.send(ph);
    } catch {
      res.status(404).send("Placeholder not found");
    }
  }
}
