// /server.js
// 🚀 TinmanApps Deal Engine — Unified Express entry point
// Automatically maps all /api/*.js routes without needing manual imports

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ Dynamically load every file in /api/
const apiPath = path.join(__dirname, "api");

fs.readdirSync(apiPath).forEach(async (file) => {
  if (file.endsWith(".js")) {
    const route = "/api/" + file.replace(".js", "");
    try {
      const module = await import(`./api/${file}`);
      if (typeof module.default === "function") {
        app.get(route, module.default);
        console.log(`✅ Registered route: ${route}`);
      } else {
        console.warn(`⚠️ Skipped ${file} — no default export`);
      }
    } catch (err) {
      console.error(`❌ Failed to load ${file}:`, err);
    }
  }
});

// ✅ Root health check
app.get("/", (_, res) => {
  res.send("✅ TinmanApps deal engine running");
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
