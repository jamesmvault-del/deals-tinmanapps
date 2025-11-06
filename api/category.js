// /api/category.js
// Returns deal listings for a specific AppSumo category

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

export default async function category(req, res) {
  try {
    const slug = req.params.slug;
    if (!slug) {
      res.status(400).json({ error: "missing-category-slug" });
      return;
    }

    const fileMap = {
      software: "appsumo-software.json",
      marketing: "appsumo-marketing.json",
      productivity: "appsumo-productivity.json",
      ai: "appsumo-ai.json",
      courses: "appsumo-courses.json",
    };

    const fileName = fileMap[slug];
    if (!fileName) {
      res.status(404).json({ error: "invalid-category" });
      return;
    }

    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "category-not-found" });
      return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json({
      category: slug,
      count: data.length,
      items: data,
      updated: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "category-failed", detail: err?.message });
  }
}
