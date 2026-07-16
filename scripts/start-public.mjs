/**
 * Cross-platform: start API bound to 0.0.0.0 with open CORS.
 * Usage: node scripts/start-public.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

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
process.env.CORS_OPEN = process.env.CORS_OPEN || "1";
process.env.PORT = process.env.PORT || "8787";

const child = spawn("npx", ["tsx", "server/index.ts"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
  cwd: root,
});

child.on("exit", (code) => process.exit(code ?? 0));
