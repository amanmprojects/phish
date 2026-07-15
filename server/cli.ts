#!/usr/bin/env -S npx tsx
import "dotenv/config";
import { readFileSync } from "node:fs";
import { runPhishAgent } from "./agent/run-phish-agent.ts";
import { parseEmail } from "./parse-email.ts";
import { quickCheck } from "./quick-check.ts";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run cli -- <email-file.txt>");
  process.exit(1);
}

const raw = readFileSync(path, "utf8");
const parsed = parseEmail(raw);
const quick = quickCheck(parsed);

console.log("=== Quick Check ===");
console.log(JSON.stringify(quick, null, 2));
console.log("\n=== Deep Investigate ===\n");

const { report, usedWebTools } = await runPhishAgent({
  rawEmail: raw,
  onEvent: (ev) => {
    if (ev.type === "status") {
      console.log(`[status] ${ev.phase}${ev.detail ? `: ${ev.detail}` : ""}`);
    } else if (ev.type === "tool_start") {
      console.log(`[tool] ${ev.toolName}`, JSON.stringify(ev.args).slice(0, 200));
    } else if (ev.type === "tool_end") {
      console.log(`[tool done] ${ev.toolName}${ev.isError ? " ERROR" : ""}`);
    } else if (ev.type === "text") {
      process.stdout.write(ev.delta);
    }
  },
});

console.log("\n\n=== Report ===");
console.log(JSON.stringify(report, null, 2));
console.log(`\nusedWebTools=${usedWebTools}`);
