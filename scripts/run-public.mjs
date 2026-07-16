/**
 * Cross-platform public dev runner (0.0.0.0) — works on Windows, macOS, Linux.
 * Usage: node scripts/run-public.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

// Load .env lightly (KEY=VALUE lines)
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

process.env.HOST = process.env.HOST || "0.0.0.0";
process.env.PORT = process.env.PORT || "8787";
process.env.WEB_PORT = process.env.WEB_PORT || "5173";
process.env.CORS_OPEN = process.env.CORS_OPEN || "1";

function lanIps() {
  const out = [];
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) {
      if (n.family === "IPv4" && !n.internal) out.push(n.address);
    }
  }
  return [...new Set(out)];
}

const port = process.env.PORT;
const webPort = process.env.WEB_PORT;
const ips = lanIps();

console.log("==============================================");
console.log("  Phish — public (0.0.0.0)");
console.log("==============================================");
console.log(`  API:  http://0.0.0.0:${port}`);
console.log(`  UI:   http://0.0.0.0:${webPort}`);
if (ips.length) {
  console.log("");
  console.log("  Open from other devices:");
  for (const ip of ips) console.log(`    http://${ip}:${webPort}`);
}
console.log("==============================================");
console.log("");

// Reuse the sequential dev orchestrator (API first, then Vite)
const child = spawn(process.execPath, [join(root, "scripts/dev.mjs")], {
  stdio: "inherit",
  env: process.env,
  shell: false,
  cwd: root,
});

child.on("exit", (code) => process.exit(code ?? 0));
