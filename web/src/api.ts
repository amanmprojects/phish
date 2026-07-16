import type { FixtureMeta, PhishReport, QuickCheckResult, TimelineItem } from "./types";

/** Extract a short human-readable query/URL from tool args (never dump raw JSON). */
export function formatToolQuery(toolName: string, args: unknown): string {
  if (args == null) return toolName.replaceAll("_", " ");
  if (typeof args === "string") {
    const t = args.trim();
    return t.length > 140 ? t.slice(0, 140) + "…" : t || toolName.replaceAll("_", " ");
  }
  if (typeof args !== "object") return String(args);

  const o = args as Record<string, unknown>;
  const pick =
    (typeof o.query === "string" && o.query) ||
    (typeof o.q === "string" && o.q) ||
    (typeof o.url === "string" && o.url) ||
    (typeof o.search === "string" && o.search) ||
    (Array.isArray(o.urls) && typeof o.urls[0] === "string" && o.urls[0]) ||
    (typeof o.input === "string" && o.input) ||
    "";

  if (pick) {
    const t = pick.trim();
    return t.length > 140 ? t.slice(0, 140) + "…" : t;
  }

  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.trim()) {
      const t = v.trim();
      return t.length > 140 ? t.slice(0, 140) + "…" : t;
    }
  }
  return toolName.replaceAll("_", " ");
}

export async function fetchFixtures(): Promise<FixtureMeta[]> {
  const res = await fetch("/api/fixtures");
  if (!res.ok) throw new Error("Failed to load fixtures");
  const data = await res.json();
  return data.fixtures as FixtureMeta[];
}

export async function loadFixture(id: string): Promise<string> {
  const res = await fetch(`/api/fixtures/${id}`);
  if (!res.ok) throw new Error("Fixture not found");
  const data = await res.json();
  return data.body as string;
}

export async function runQuickCheck(email: string): Promise<QuickCheckResult> {
  const res = await fetch("/api/quick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (res.status === 429) throw new Error("Too many requests — wait a moment and try again");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Quick check failed");
  }
  const data = await res.json();
  return data.result as QuickCheckResult;
}

export interface AnalyzeHandlers {
  onQuick?: (r: QuickCheckResult) => void;
  onTimeline?: (item: TimelineItem) => void;
  onText?: (delta: string) => void;
  onReport?: (r: PhishReport) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export async function runDeepAnalyze(
  email: string,
  handlers: AnalyzeHandlers,
  signal?: AbortSignal,
  opts?: { enableWeb?: boolean },
): Promise<void> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      includeQuick: true,
      enableWeb: opts?.enableWeb !== false,
    }),
    signal,
  });

  if (res.status === 429) {
    throw new Error("Too many analyze requests — wait a moment and try again");
  }
  if (res.status === 503) {
    throw new Error("Server is busy — retry in a moment");
  }
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Analyze failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const block of parts) {
        const lines = block.split("\n");
        let eventType = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }

        const type = (payload.type as string) || eventType;
        const at = Date.now();

        switch (type) {
          case "quick":
            handlers.onQuick?.(payload.result as QuickCheckResult);
            break;
          case "status":
            handlers.onTimeline?.({
              kind: "status",
              phase: String(payload.phase ?? ""),
              detail: payload.detail ? String(payload.detail) : undefined,
              at,
            });
            break;
          case "tool_start":
            handlers.onTimeline?.({
              kind: "tool",
              toolCallId: payload.toolCallId ? String(payload.toolCallId) : undefined,
              toolName: String(payload.toolName ?? "tool"),
              query: formatToolQuery(String(payload.toolName ?? "tool"), payload.args),
              status: "running",
              at,
            });
            break;
          case "tool_end":
            handlers.onTimeline?.({
              kind: "tool",
              toolCallId: payload.toolCallId ? String(payload.toolCallId) : undefined,
              toolName: String(payload.toolName ?? "tool"),
              query: "",
              status: payload.isError ? "error" : "done",
              at,
            });
            break;
          case "text":
            if (payload.delta) handlers.onText?.(String(payload.delta));
            break;
          case "report":
            handlers.onReport?.(payload.result as PhishReport);
            break;
          case "error":
            handlers.onError?.(String(payload.message ?? "Unknown error"));
            handlers.onTimeline?.({
              kind: "error",
              message: String(payload.message ?? "Unknown error"),
              at,
            });
            break;
          case "done":
            finished = true;
            handlers.onDone?.();
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finished) handlers.onDone?.();
}
