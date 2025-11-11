// /scripts/referral-cycle.js
// TinmanApps — Referral Integrity Cycle v3.0
// “Sequential · Deterministic · Zero-Error Execution”
// -----------------------------------------------------------------------------
// Runs the full TinmanApps pipeline in the correct order:
//
//   1) updateFeed.js
//   2) referral-map.js
//   3) referral-diff.js
//   4) referral-repair.js
//   5) master-cron (silent)
//
// This script is Render-safe, stops immediately on failures, and produces
// readable logs. Use it as your scheduled CRON entry.
//
// Example CRON command:
//
//   node scripts/referral-cycle.js
// -----------------------------------------------------------------------------

import { execSync } from "child_process";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function run(label, command) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▶️  ${label}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  try {
    execSync(command, { stdio: "inherit", cwd: path.resolve(__dirname, "..") });
    console.log(`✅  ${label} completed successfully.\n`);
  } catch (err) {
    console.error(`❌  ${label} FAILED.`);
    console.error(err.message || err);
    process.exit(1); // immediate fail-fast
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// EXECUTION SEQUENCE (DO NOT CHANGE ORDER)
// ───────────────────────────────────────────────────────────────────────────────

run("1) updateFeed.js", "node scripts/updateFeed.js");

run("2) referral-map.js", "node scripts/referral-map.js");

run("3) referral-diff.js", "node scripts/referral-diff.js");

run("4) referral-repair.js", "node scripts/referral-repair.js");

// master-cron is called via HTTP to ensure the full web pipeline runs
run(
  "5) master-cron (silent)",
  `curl -s "https://deals.tinmanapps.com/api/master-cron?silent=1"`
);

console.log(`\n✅✅✅  FULL REFERRAL CYCLE COMPLETE  ✅✅✅\n`);
