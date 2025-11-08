// /api/cta-dump.js
// TinmanApps — CTA & Subtitle JSON Exporter (for review & tuning)

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

export default async function handler(req, res) {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith("appsumo-"));
  const output = {};

  for (const file of files) {
    const cat = file.replace("appsumo-", "").replace(".json", "");
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
      output[cat] = data.map(d => ({
        title: d.title,
        cta: d.seo?.cta || null,
        subtitle: d.seo?.subtitle || null
      }));
    } catch {
      output[cat] = { error: "failed to parse" };
    }
  }

  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(output, null, 2));
}
