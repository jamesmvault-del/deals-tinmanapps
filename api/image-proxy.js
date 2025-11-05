// /api/image-proxy.js
// 🖼️ TinmanApps Image Proxy & Cache Layer
// Securely serves AppSumo deal thumbnails through your own domain.
// Benefits: SEO originality, Cloudflare caching, and referral-safe control.

import https from "https";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";

// Directory for cached images (lives inside /data/images/)
const CACHE_DIR = path.resolve("./data/images");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Maximum age before cache refresh (in hours)
const CACHE_HOURS = 48;

// Simple helper to fetch and save image
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

// ✅ Express handler
export default async function handler(req, res) {
  try {
    const src = decodeURIComponent(req.query.src || "").trim();
    if (!src) {
      return res.status(400).json({ error: "Missing ?src parameter" });
    }

    // Clean filename
    const name = src
      .split("/")
      .pop()
      .replace(/[^a-zA-Z0-9.-]/g, "_");
    const localPath = path.join(CACHE_DIR, name);

    // Use cached file if recent
    if (fs.existsSync(localPath)) {
      const ageHours =
        (Date.now() - fs.statSync(localPath).mtimeMs) / 1000 / 3600;
      if (ageHours < CACHE_HOURS) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return fs.createReadStream(localPath).pipe(res);
      }
    }

    // Otherwise, fetch fresh copy
    console.log("🖼️ Refreshing image:", src);
    await downloadImage(src, localPath);
    await delay(100); // small pause to ensure write completion

    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(localPath).pipe(res);
  } catch (err) {
    console.error("❌ Image proxy error:", err);
    res.redirect("/assets/placeholder.webp"); // fallback image
  }
}
