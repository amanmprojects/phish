import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runPhishAgent } from "./agent/run-phish-agent.ts";
import { parseEmail } from "./parse-email.ts";
import { quickCheck } from "./quick-check.ts";
import type { AgentEvent } from "./schema.ts";
import { listFixtures, loadFixture } from "./fixtures.ts";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8787"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    tavily: Boolean(process.env.TAVILY_API_KEY?.trim()),
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
  const email = typeof body.email === "string" ? body.email : "";
  if (!email.trim()) return c.json({ error: "email is required" }, 400);
  const parsed = parseEmail(email);
  return c.json({ parsed, result: quickCheck(parsed) });
});

app.post("/api/analyze", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const includeQuick = body.includeQuick !== false;
  const enableWeb = body.enableWeb !== false;

  if (!email.trim()) return c.json({ error: "email is required" }, 400);

  return streamSSE(c, async (stream) => {
    // Serialize SSE writes so tool/text events stay ordered under concurrent callbacks
    let chain: Promise<void> = Promise.resolve();
    const send = (event: AgentEvent) => {
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

      await runPhishAgent({
        rawEmail: email,
        enableWeb,
        onEvent: (ev) => {
          void send(ev);
        },
      });

      await chain;
      await send({ type: "done" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await chain;
      await send({ type: "error", message });
      await send({ type: "done" });
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
const hostname = process.env.HOST ?? "127.0.0.1";

console.log(`CampusGuard server listening on http://${hostname}:${port}`);
console.log(`Tavily: ${process.env.TAVILY_API_KEY ? "configured" : "missing (text-only deep check)"}`);

serve({ fetch: app.fetch, port, hostname });
