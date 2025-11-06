// /server.js
// TinmanApps — Deal Engine Master Server
// Handles API routes, category rendering, CTR logging, and adaptive SEO endpoints.

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Core API endpoints
import appsumoProxy from "./api/appsumo-proxy.js";
import masterCron from "./api/master-cron.js";
import insight from "./api/insight.js";
import imageProxy from "./api/image-proxy.js";
import track from "./api/track.js";
import ctrReport from "./api/ctr-report.js";
import ctaPhrases from "./api/cta-phrases.js";

// Category endpoints
import categoriesIndex from "./api/categories-index.js"; // JSON index list
import categories from "./api/categories.js"; // HTML renderer

// (Optional) Home route
import home from "./api/home.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ───────────────────────────────────────────────────────────────────────────────
// STATIC ASSETS
// ───────────────────────────────────────────────────────────────────────────────
app.use("/assets", express.static(path.join(__dirname, "public/assets"), {
  maxAge: "7d",
}));

// ───────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ───────────────────────────────────────────────────────────────────────────────
app.get("/api/appsumo-proxy", appsumoProxy);
app.get("/api/master-cron", masterCron);
app.get("/api/insight", insight);
app.get("/api/image-proxy", imageProxy);
app.get("/api/track", track);
app.get("/api/ctr-report", ctrReport);
app.get("/api/cta-phrases", ctaPhrases);

// Category index (JSON list for homepage)
app.get("/api/categories", categoriesIndex);

// Category renderer (HTML)
app.get("/categories/:cat", categories);

// ───────────────────────────────────────────────────────────────────────────────
// FRONTEND ROUTES (HTML)
// ───────────────────────────────────────────────────────────────────────────────
app.get("/", home);
app.get("/categories", (req, res) => {
  res.redirect("/"); // or render category index page later if desired
});

// ───────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ───────────────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.send("✅ Healthy"));

// ───────────────────────────────────────────────────────────────────────────────
// FALLBACK HANDLER
// ───────────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send("Page not found.");
});

// ───────────────────────────────────────────────────────────────────────────────
// START SERVER
// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 TinmanApps Deal Engine running on port ${PORT}`);
  console.log("✅ Registered routes:");
  console.log(" - /api/appsumo-proxy");
  console.log(" - /api/master-cron");
  console.log(" - /api/insight");
  console.log(" - /api/image-proxy");
  console.log(" - /api/track");
  console.log(" - /api/ctr-report");
  console.log(" - /api/cta-phrases");
  console.log(" - /api/categories");
  console.log(" - /categories/:cat");
});
