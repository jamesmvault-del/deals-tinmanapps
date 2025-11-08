export default function handler(req, res) {
  res.json({
    ctaEngineVersion: "v3.7 Precision Diversity (expected live)",
    timestamp: new Date().toISOString(),
    envDir: process.cwd(),
    cacheBust: Math.random().toString(36).substring(2, 10),
  });
}
