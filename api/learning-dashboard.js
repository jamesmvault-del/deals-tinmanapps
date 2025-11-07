// /api/learning-dashboard.js
// 📈 TinmanApps Adaptive Learning Dashboard v1.1 “CTR Trend Memory”
// ───────────────────────────────────────────────────────────────────────────────
// Adds: 7-day CTR trend chart using `recent` array in ctr-insights.json
// Shows total clicks, active learning categories, top biases, and tone bias evolution
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const LEARN_FILE = path.resolve("./data/learning-governor.json");
const CTR_FILE = path.resolve("./data/ctr-insights.json");

function loadJsonSafe(p, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  const learning = loadJsonSafe(LEARN_FILE, {});
  const ctr = loadJsonSafe(CTR_FILE, {
    totalClicks: 0,
    byCategory: {},
    recent: [],
  });

  // --- CTR trend for past 7 days ---
  const today = new Date();
  const dailyCounts = Array(7).fill(0);
  ctr.recent.forEach((r) => {
    const date = new Date(r.at);
    const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < 7) dailyCounts[6 - diffDays]++;
  });
  const trendData = JSON.stringify(dailyCounts);

  // --- Table rows ---
  const rows = Object.entries(learning).map(([category, data]) => {
    const clicks = ctr.byCategory?.[category] || 0;
    const tone = data.toneBias || "neutral";
    const biasKeys = Object.keys(data.biases || {});
    const topBiases =
      biasKeys.length > 0
        ? biasKeys
            .sort((a, b) => (data.biases[b] || 0) - (data.biases[a] || 0))
            .slice(0, 5)
        : [];
    const totalBias = biasKeys.reduce(
      (acc, k) => acc + (data.biases[k] || 0),
      0
    );

    return `
      <tr>
        <td>${category}</td>
        <td>${tone}</td>
        <td>${clicks}</td>
        <td>${totalBias}</td>
        <td>${topBiases.join(", ") || "—"}</td>
      </tr>
    `;
  });

  // --- HTML render ---
  const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>TinmanApps Learning Dashboard</title>
    <style>
      body {
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        background: #f6f8fb;
        margin: 0;
        color: #1a1d26;
      }
      header {
        padding: 20px 24px;
        background: #2a63f6;
        color: #fff;
        box-shadow: 0 2px 10px rgba(0,0,0,.1);
      }
      h1 { margin: 0; font-size: 22px; }
      main {
        padding: 24px;
        max-width: 900px;
        margin: 0 auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,.05);
        border-radius: 10px;
        overflow: hidden;
      }
      th, td {
        text-align: left;
        padding: 10px 12px;
      }
      th {
        background: #eef2ff;
        color: #2a63f6;
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.05em;
      }
      tr:nth-child(even) { background: #fafbfe; }
      footer {
        text-align: center;
        padding: 18px;
        font-size: 13px;
        color: #7a8199;
      }
      .metric {
        font-size: 28px;
        font-weight: 600;
        color: #2a63f6;
      }
      .metric-sub { font-size: 13px; color: #7a8199; margin-top: 4px; }
      .grid { display: flex; gap: 24px; margin-bottom: 28px; flex-wrap: wrap; }
      .card {
        flex: 1 1 240px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0,0,0,.06);
        padding: 16px 18px;
      }
      canvas {
        width: 100%;
        height: 160px;
        margin-top: 12px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 1px 5px rgba(0,0,0,.08);
      }
    </style>
  </head>
  <body>
    <header>
      <h1>🧠 TinmanApps Learning Dashboard</h1>
      <div style="font-size:13px;opacity:.85;">CTR Evolution & Tone Reinforcement Overview</div>
    </header>
    <main>
      <div class="grid">
        <div class="card">
          <div class="metric">${ctr.totalClicks || 0}</div>
          <div class="metric-sub">Total Clicks Recorded</div>
        </div>
        <div class="card">
          <div class="metric">${Object.keys(learning).length}</div>
          <div class="metric-sub">Active Learning Categories</div>
        </div>
      </div>

      <h3 style="margin:12px 0 4px;">📈 CTR Trend (past 7 days)</h3>
      <canvas id="trend"></canvas>

      <table style="margin-top:28px;">
        <thead>
          <tr>
            <th>Category</th>
            <th>Tone</th>
            <th>Clicks</th>
            <th>Reinforcements</th>
            <th>Top Biases</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </main>
    <footer>
      Updated ${new Date().toLocaleString()} • Data auto-syncs with ctr-insights.json + learning-governor.json
    </footer>
    <script>
      const data = ${trendData};
      const canvas = document.getElementById("trend");
      const ctx = canvas.getContext("2d");
      const w = canvas.width, h = canvas.height;
      const step = w / (data.length - 1);
      const max = Math.max(...data, 1);
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(0, h - (data[0] / max) * (h - 20) - 10);
      for (let i = 1; i < data.length; i++) {
        const x = i * step;
        const y = h - (data[i] / max) * (h - 20) - 10;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#2a63f6";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = "rgba(42,99,246,0.1)";
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    </script>
  </body>
  </html>`;

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
}
