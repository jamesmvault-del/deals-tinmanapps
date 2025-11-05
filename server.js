// server.js — minimal Node HTTP router
// Purpose: serve /api endpoints like /api/appsumo-builder
// Run locally via: node server.js

import http from "http";
import url from "url";
import appsumoBuilder from "./api/appsumo-builder.js";

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);
  try {
    if (pathname.startsWith("/api/appsumo-builder")) {
      return appsumoBuilder(req, res);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("✅ TinmanApps deal engine running");
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Error: " + err.message);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
