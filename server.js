// /server.js
// Main entry — TinmanApps Adaptive SEO Engine Core

import express from "express";
import path from "path";
import url from "url";

import categories from "./api/categories.js";
import category from "./api/category.js";
import imageProxy from "./api/image-proxy.js";
import imageHealer from "./api/image-healer.js"; // ✅ NEW
import fs from "fs";

const app = express();
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Serve static assets
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use(express.json());

// ────────────────────────────────────────────────────────────────
// API ROUTES
// ────────────────────────────────────────────────────────────────
app.get("/api/categories", categories);
app.get("/api/category/:slug", category);
app.get("/api/image-proxy", imageProxy);
app.get("/api/image-healer", imageHealer); // ✅ NEW self-healing route

// ────────────────────────────────────────────────────────────────
// FRONTEND ROUTES
// ────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.redirect("/categories");
});

app.get("/categories/:slug?", async (req, res) => {
  const slug = req.params.slug;
  const pagePath = slug
    ? path.join(__dirname, "pages", "category.html")
    : path.join(__dirname, "pages", "categories.html");

  if (fs.existsSync(pagePath)) res.sendFile(pagePath);
  else res.status(404).send("Page not found");
});

// ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ TinmanApps Adaptive SEO Engine live on port ${PORT}`);
});
