/**
 * Cross-platform dev runner:
 * 1) start API
 * 2) wait until /api/health responds
 * 3) start Vite
 *
 * Avoids Windows quote bugs with nested concurrently / .cmd shims, and
 * works when the project path contains spaces (e.g. C:\Users\Aman Mehtar\…).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 8787);
const healthUrl = `http://127.0.0.1:${port}/api/health`;
const isWin = process.platform === "win32";
const require = createRequire(join(root, "package.json"));

function resolveCli(pkg, candidates) {
  for (const rel of candidates) {
    try {
      return require.resolve(`${pkg}/${rel}`);
    } catch {
      /* try next */
    }
  }
  // Fallback: walk from package root
  const pkgJson = require.resolve(`${pkg}/package.json`);
  const pkgRoot = dirname(pkgJson);
  for (const rel of candidates) {
    const p = join(pkgRoot, rel);
    if (existsSync(p)) return p;
  }
  throw new Error(`Could not resolve CLI for ${pkg}`);
}

const tsxCli = resolveCli("tsx", ["dist/cli.mjs", "dist/cli.js"]);
const viteCli = resolveCli("vite", ["bin/vite.js", "dist/node/cli.js"]);

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

function spawnLogged(label, args) {
  // Always: node <cli> …  — no shell, safe with spaces in paths
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });
  children.push(child);

  const prefix = (stream, chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.length === 0) continue;
      stream.write(`[${label}] ${line}\n`);
    }
  };

  child.stdout?.on("data", (c) => prefix(process.stdout, c));
  child.stderr?.on("data", (c) => prefix(process.stderr, c));

  child.on("error", (err) => {
    console.error(`[dev] failed to start ${label}:`, err.message);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] ${label} exited (code=${code}, signal=${signal ?? "none"})`);
    shutdown(code ?? 1);
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      if (c.pid && !c.killed) {
        if (isWin) {
          spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], {
            stdio: "ignore",
            shell: true,
            windowsHide: true,
          });
        } else {
          c.kill("SIGTERM");
        }
      }
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), isWin ? 800 : 300).unref?.();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function waitForHealth(timeoutMs = 45_000) {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await sleep(250);
  }
  console.error(`[dev] API did not become ready at ${healthUrl}`);
  console.error(`[dev] last error: ${lastErr}`);
  console.error(`[dev] Is port ${port} already in use by a zombie process?`);
  if (isWin) {
    console.error(`[dev]   netstat -ano | findstr :${port}`);
  } else {
    console.error(`[dev]   lsof -i :${port}`);
  }
  return false;
}

console.log(`[dev] starting API on port ${port}…`);
spawnLogged("server", [tsxCli, "watch", "server/index.ts"]);

const ready = await waitForHealth();
if (!ready) {
  shutdown(1);
} else {
  console.log(`[dev] API ready at ${healthUrl}`);
  console.log(`[dev] starting Vite…`);
  spawnLogged("web", [viteCli, "--config", "web/vite.config.ts"]);
}
