// /server.js
// Express entry point for TinmanApps Adaptive Deal Engine
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// ✅ Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import appsumoProxy from "./api/appsumo-proxy.js";
import masterCron from "./api/master-cron.js";
import insight from "./api/insight.js";
import imageProxy from "./api/image-proxy.js";
import categoriesApi from "./api/categories.js";
import categoryApi from "./api/category.js";

const app = express();

// ✅ Serve static assets (placeholder, css, etc.)
app.use("/assets", express.static(path.join(__dirname, "public", "assets")));
app.use("/data", express.static(path.join(__dirname, "data")));
app.use("/pages", express.static(path.join(__dirname, "pages")));

// ✅ API routes
app.get("/api/appsumo-proxy", appsumoProxy);
app.get("/api/master-cron", masterCron);
app.get("/api/insight", insight);
app.get("/api/image-proxy", imageProxy);
app.get("/api/categories", categoriesApi);
app.get("/api/category/:slug", categoryApi);

// ✅ Dynamic pages (SSR-lite style)
app.get("/categories", (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "categories.html"));
});

app.get("/categories/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "category.html"));
});

// ✅ Root / Healthcheck
app.get("/", (req, res) => {
  res.send("✅ TinmanApps Adaptive Deal Engine running");
});

// ✅ Error fallback for unknown routes
app.use((req, res) => {
  res.status(404).send("❌ Page not found");
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("✅ Registered routes:");
  console.log("/api/appsumo-proxy");
  console.log("/api/master-cron");
  console.log("/api/insight");
  console.log("/api/image-proxy");
  console.log("/api/categories");
  console.log("/api/category/:slug");
  console.log("/categories");
  console.log("/categories/:slug");
});
