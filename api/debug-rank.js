// /api/debug-rank.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Smart Ranking Debug Endpoint v1.0
//
// Purpose:
// View ranking engine output in real time — see CTR, keyword, freshness,
// and final weighted scores for each deal in a given category.
//
// Usage:
//   /api/debug-rank?cat=ai
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { rankDeals } from "../lib/rankingEngine.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

function loadJsonSafe(file, fallback = []) {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  const cat = String(req.query.cat || "software").toLowerCase();
  const deals = loadJsonSafe(`appsumo-${cat}.json`, []);
  const ranked = rankDeals(deals, cat);

  // Show only top 25 for readability
  const view = ranked.slice(0, 25).map((d, i) => ({
    rank: i + 1,
    title: d.title,
    slug: d.slug,
    score: d._rankScore || "N/A",
    ctrWeight: d._ctrWeight || 0,
    freshness: d._freshness || 0,
    keywordBias: d._keywordBias || 0,
  }));

  const html = `
  <html>
  <head>
    <title>Ranking Debug — ${cat}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto; background:#f6f8fb; color:#111; padding:24px; }
      h1 { margin:0 0 12px; color:#2a63f6; }
      table { border-collapse: collapse; width:100%; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.05); }
      th, td { text-align:left; padding:10px 14px; border-bottom:1px solid #eef1f5; }
      th { background:#eef2ff; color:#2a63f6; text-transform:uppercase; font-size:12px; }
      tr:hover { background:#f9fbff; }
      .score { font-weight:600; color:#1d4fe6; }
    </style>
  </head>
  <body>
    <h1>📊 Ranking Debug: ${cat}</h1>
    <table>
      <thead>
        <tr><th>#</th><th>Title</th><th>CTR</th><th>Freshness</th><th>Keyword</th><th>Score</th></tr>
      </thead>
      <tbody>
      ${view
        .map(
          (v) => `<tr>
          <td>${v.rank}</td>
          <td>${v.title}</td>
          <td>${v.ctrWeight.toFixed(3)}</td>
          <td>${v.freshness.toFixed(3)}</td>
          <td>${v.keywordBias.toFixed(3)}</td>
          <td class="score">${v.score.toFixed(3)}</td>
        </tr>`
        )
        .join("\n")}
      </tbody>
    </table>
  </body>
  </html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
}
