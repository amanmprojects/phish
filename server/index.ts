import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listFixtures, loadFixture } from "./fixtures.ts";
import {
  AGENT_TIMEOUT_MS,
  clientKey,
  ConcurrencyGate,
  RateLimiter,
  validateEmailBody,
} from "./limits.ts";
import { parseEmail } from "./parse-email.ts";
import { quickCheck } from "./quick-check.ts";
import type { AgentEvent } from "./schema.ts";

/**
 * Lazy-load the Pi agent so the HTTP server binds immediately.
 * Eager import of @earendil-works/pi-coding-agent can take many seconds on cold start,
 * which made Vite proxy to :8787 fail with ECONNREFUSED while the UI was already up.
 */
type RunPhishAgent = typeof import("./agent/run-phish-agent.ts").runPhishAgent;
let runPhishAgentPromise: Promise<RunPhishAgent> | null = null;

function loadRunPhishAgent(): Promise<RunPhishAgent> {
  if (!runPhishAgentPromise) {
    runPhishAgentPromise = import("./agent/run-phish-agent.ts").then((m) => m.runPhishAgent);
  }
  return runPhishAgentPromise;
}

const app = new Hono();

const bindHost = process.env.HOST ?? "127.0.0.1";
const publicBind = bindHost === "0.0.0.0" || bindHost === "::" || process.env.CORS_OPEN === "1";

const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];

app.use(
  "*",
  cors({
    // Prefer explicit allowlist; CORS_OPEN=1 keeps * for LAN demos
    origin: publicBind && !corsOrigins.length
      ? "*"
      : corsOrigins.length
        ? corsOrigins
        : defaultOrigins,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

const analyzeLimiter = new RateLimiter();
const analyzeGate = new ConcurrencyGate();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    tavily: Boolean(process.env.TAVILY_API_KEY?.trim()),
    concurrent: analyzeGate.running,
  }),
);

app.get("/api/fixtures", (c) => c.json({ fixtures: listFixtures() }));

app.get("/api/fixtures/:id", (c) => {
  const id = c.req.param("id");
  const body = loadFixture(id);
  if (!body) return c.json({ error: "not found" }, 404);
  return c.json({ id, body });
});

app.post("/api/quick", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const check = validateEmailBody((body as { email?: unknown }).email);
  if (!check.ok) return c.json({ error: check.error }, check.status);
  const parsed = parseEmail(check.email);
  return c.json({ parsed, result: quickCheck(parsed) });
});

app.post("/api/analyze", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const emailField = (body as { email?: unknown }).email;
  const includeQuick = (body as { includeQuick?: boolean }).includeQuick !== false;
  const enableWeb = (body as { enableWeb?: boolean }).enableWeb !== false;

  const check = validateEmailBody(emailField);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const ip = clientKey(c);
  if (!analyzeLimiter.allow(ip)) {
    const retry = analyzeLimiter.retryAfterSec(ip);
    c.header("Retry-After", String(retry));
    return c.json({ error: "Too many analyze requests. Try again shortly.", retryAfter: retry }, 429);
  }

  if (!analyzeGate.tryAcquire()) {
    return c.json({ error: "Server is busy with other investigations. Retry in a moment." }, 503);
  }

  const email = check.email;

  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), AGENT_TIMEOUT_MS);

    // Client disconnect → cancel agent
    const onAbort = () => ac.abort();
    c.req.raw.signal?.addEventListener("abort", onAbort);

    let chain: Promise<void> = Promise.resolve();
    const send = (event: AgentEvent) => {
      if (ac.signal.aborted && event.type !== "error" && event.type !== "done") {
        return chain;
      }
      chain = chain.then(() =>
        stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        }),
      );
      return chain;
    };

    try {
      if (includeQuick) {
        const parsed = parseEmail(email);
        await send({ type: "quick", result: quickCheck(parsed) });
      }

      await send({
        type: "status",
        phase: "loading",
        detail: "Loading investigation agent…",
      });
      const runPhishAgent = await loadRunPhishAgent();
      if (ac.signal.aborted) throw Object.assign(new Error("Analysis cancelled"), { name: "AbortError" });

      await runPhishAgent({
        rawEmail: email,
        enableWeb,
        signal: ac.signal,
        onEvent: (ev) => {
          void send(ev);
        },
      });

      await chain;
      await send({ type: "done" });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const message =
        name === "AbortError"
          ? c.req.raw.signal?.aborted
            ? "Analysis cancelled"
            : "Analysis timed out"
          : err instanceof Error
            ? err.message
            : String(err);
      await chain;
      if (name !== "AbortError" || !c.req.raw.signal?.aborted) {
        await send({ type: "error", message });
      } else {
        await send({ type: "error", message: "Analysis cancelled" });
      }
      await send({ type: "done" });
    } finally {
      clearTimeout(timeout);
      c.req.raw.signal?.removeEventListener("abort", onAbort);
      analyzeGate.release();
    }
  });
});

// Production: serve built web UI if present
const distDir = join(process.cwd(), "web/dist");
if (existsSync(distDir)) {
  app.use("/*", serveStatic({ root: "./web/dist" }));
  app.get("*", async (c) => {
    const index = join(distDir, "index.html");
    if (existsSync(index)) {
      const { readFile } = await import("node:fs/promises");
      return c.html(await readFile(index, "utf8"));
    }
    return c.text("UI not built. Run npm run build or npm run dev.", 404);
  });
}

const port = Number(process.env.PORT ?? 8787);
const hostname = bindHost;

const server = serve({
  fetch: app.fetch,
  port,
  hostname,
}, (info) => {
  const addr = info.address === "::" ? "127.0.0.1" : info.address;
  console.log(`Phish server listening on http://${addr}:${info.port}`);
  if (publicBind) {
    console.log(`Public bind enabled — reachable on this machine's LAN IPs (port ${info.port})`);
  }
  console.log(`Tavily: ${process.env.TAVILY_API_KEY ? "configured" : "missing (text-only deep check)"}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the other process or set PORT=… to a free port.`,
    );
  } else {
    console.error("Failed to start Phish server:", err);
  }
  process.exit(1);
});
