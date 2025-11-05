// /api/image-proxy.js
// 🖼️ TinmanApps Image Proxy & Cache Layer (v2.0)
// Securely serves AppSumo thumbnails via your domain for SEO originality and CTR performance.

import https from "https";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";

// Directory for cached images (inside /data/images/)
const CACHE_DIR = path.resolve("./data/images");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Cache validity (in hours)
const CACHE_HOURS = 48;

// Helper: download and save an image locally
async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`HTTP ${response.statusCode}`));
        }
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        try {
          fs.unlinkSync(destPath);
        } catch {}
        reject(err);
      });
  });
}

// ✅ Main handler
export default async function handler(req, res) {
  try {
    const src = decodeURIComponent(req.query.src || "").trim();
    if (!src) {
      return res.status(400).json({ error: "Missing ?src parameter" });
    }

    // Clean filename for local cache
    const name = src.split("/").pop().replace(/[^a-zA-Z0-9.-]/g, "_");
    const localPath = path.join(CACHE_DIR, name);

    // Use cache if available and recent
    if (fs.existsSync(localPath)) {
      const ageHours =
        (Date.now() - fs.statSync(localPath).mtimeMs) / 1000 / 3600;
      if (ageHours < CACHE_HOURS) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return fs.createReadStream(localPath).pipe(res);
      }
    }

    // Otherwise fetch fresh image
    console.log("🖼️ Refreshing image:", src);
    await downloadImage(src, localPath);
    await delay(100); // ensure disk write

    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(localPath).pipe(res);
  } catch (err) {
    console.error("❌ Image proxy error:", err);
    const fallbackPath = path.resolve("./public/assets/placeholder.webp");
    if (fs.existsSync(fallbackPath)) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      return fs.createReadStream(fallbackPath).pipe(res);
    } else {
      // Final fail-safe: plain text notice
      res.status(404).send("⚠️ Fallback image missing (placeholder.webp)");
    }
  }
}
