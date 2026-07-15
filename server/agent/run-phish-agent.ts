import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai/compat";
import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { formatParsedForPrompt, parseEmail } from "../parse-email.ts";
import type { AgentEvent, PhishReport } from "../schema.ts";
import { fallbackReportFromText, parsePhishReport } from "./parse-result.ts";
import { buildUserPrompt, PHISH_SYSTEM_PROMPT } from "./system-prompt.ts";

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

function resolveTavilyExtensionPath(): string | null {
  return firstExisting([
    join(process.cwd(), ".pi/npm/node_modules/@tavily/pi-extension/index.ts"),
    join(homedir(), ".pi/agent/npm/node_modules/@tavily/pi-extension/index.ts"),
  ]);
}

/** SuperGrok registers Grok models via OAuth — needed when default provider is supergrok. */
function resolveSupergrokExtensionPath(): string | null {
  return firstExisting([
    join(process.cwd(), ".pi/npm/node_modules/pi-supergrok/extensions/index.ts"),
    join(homedir(), ".pi/agent/npm/node_modules/pi-supergrok/extensions/index.ts"),
  ]);
}

function summarizeToolResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result.slice(0, 280);
  try {
    const s = JSON.stringify(result);
    return s.length > 280 ? s.slice(0, 280) + "…" : s;
  } catch {
    return String(result).slice(0, 280);
  }
}

function pickModel(
  modelRegistry: ModelRegistry,
  settings: { defaultProvider?: string; defaultModel?: string },
): Model<any> | undefined {
  const available = modelRegistry.getAvailable();
  const key = (p: string, id: string) => `${p}::${id}`;
  const availableSet = new Set(available.map((m) => key(m.provider, m.id)));

  const tryPick = (provider?: string, id?: string) => {
    if (!provider || !id) return undefined;
    const m = modelRegistry.find(provider, id);
    if (m && availableSet.has(key(m.provider, m.id))) return m;
    // Same provider, any available model (settings may list an outdated id)
    return available.find((a) => a.provider === provider);
  };

  const fromEnv = tryPick(process.env.PI_PROVIDER?.trim(), process.env.PI_MODEL?.trim());
  if (fromEnv) return fromEnv;

  const fromSettings = tryPick(settings.defaultProvider, settings.defaultModel);
  if (fromSettings) return fromSettings;

  // Prefer supergrok if present (works with pi-supergrok OAuth on this machine)
  const supergrok = available.find((m) => m.provider === "supergrok");
  if (supergrok) return supergrok;

  return available[0];
}

function extractAssistantText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as {
      role?: string;
      content?: unknown;
      stopReason?: string;
      errorMessage?: string;
    };
    if (m?.role !== "assistant") continue;

    if (m.stopReason === "error" && m.errorMessage) {
      throw new Error(`Model error: ${m.errorMessage}`);
    }

    const content = m.content;
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      const text = content
        .filter((p): p is { type: string; text?: string } => !!p && typeof p === "object")
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("");
      if (text.trim()) return text;
    }
  }
  return "";
}

export interface RunPhishAgentOptions {
  rawEmail: string;
  onEvent?: (event: AgentEvent) => void;
  /** When false, skip Tavily. Default: true if TAVILY_API_KEY is set. */
  enableWeb?: boolean;
}

export interface RunPhishAgentResult {
  report: PhishReport;
  assistantText: string;
  usedWebTools: boolean;
}

export async function runPhishAgent(options: RunPhishAgentOptions): Promise<RunPhishAgentResult> {
  const { rawEmail, onEvent } = options;
  const emit = (e: AgentEvent) => onEvent?.(e);

  const parsed = parseEmail(rawEmail);
  const hasTavilyKey = Boolean(process.env.TAVILY_API_KEY?.trim());
  const enableWeb = options.enableWeb ?? hasTavilyKey;
  const tavilyPath = enableWeb && hasTavilyKey ? resolveTavilyExtensionPath() : null;
  const usedWebTools = Boolean(tavilyPath);
  const supergrokPath = resolveSupergrokExtensionPath();

  if (enableWeb && !hasTavilyKey) {
    emit({
      type: "status",
      phase: "warning",
      detail: "TAVILY_API_KEY not set — running text-only analysis (no web verification).",
    });
  } else if (enableWeb && hasTavilyKey && !tavilyPath) {
    emit({
      type: "status",
      phase: "warning",
      detail: "Tavily Pi extension not found — running text-only analysis.",
    });
  }

  emit({ type: "status", phase: "starting", detail: "Creating investigation agent…" });

  const cwd = process.cwd();
  const agentDir = getAgentDir();

  const settingsManager = SettingsManager.create(cwd, agentDir);
  settingsManager.applyOverrides({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 2 },
  });

  const globalSettings = {
    defaultProvider: settingsManager.getDefaultProvider(),
    defaultModel: settingsManager.getDefaultModel(),
  };

  // Only load known-safe extensions (model provider + optional Tavily). No bash stack.
  const extensionPaths = [supergrokPath, tavilyPath].filter((p): p is string => Boolean(p));

  // createAgentSessionServices reloads extensions and flushes provider registrations
  // onto the model registry *before* we pick a model — required for SuperGrok.
  const services = await createAgentSessionServices({
    cwd,
    agentDir,
    settingsManager,
    resourceLoaderOptions: {
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      noExtensions: true,
      additionalExtensionPaths: extensionPaths,
      systemPromptOverride: () => PHISH_SYSTEM_PROMPT,
      appendSystemPromptOverride: () => [],
    },
  });

  for (const d of services.diagnostics) {
    if (d.type === "error" || d.type === "warning") {
      emit({ type: "status", phase: "warning", detail: d.message });
    }
  }

  const model = pickModel(services.modelRegistry, globalSettings);
  if (!model) {
    throw new Error(
      "No usable model found. Configure Pi auth (supergrok/openai-codex OAuth or API keys) " +
        "or set PI_PROVIDER + PI_MODEL.",
    );
  }

  emit({
    type: "status",
    phase: "model",
    detail: `Using ${model.provider}/${model.id}${usedWebTools ? " · web tools on" : " · text-only"}`,
  });

  const { session, modelFallbackMessage, extensionsResult } = await createAgentSessionFromServices({
    services,
    model,
    thinkingLevel: "low",
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "builtin",
    tools: usedWebTools ? ["web_search", "web_fetch"] : [],
  });

  if (modelFallbackMessage) {
    emit({ type: "status", phase: "warning", detail: modelFallbackMessage });
  }

  const extErrors = extensionsResult?.errors ?? [];
  if (extErrors.length) {
    emit({
      type: "status",
      phase: "warning",
      detail: `Extension load notes: ${extErrors
        .map((e) =>
          typeof e === "object" && e && "message" in e
            ? String((e as { message: string }).message)
            : String(e),
        )
        .join("; ")}`,
    });
  }

  let streamedText = "";

  try {
    session.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        emit({
          type: "tool_start",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        });
      } else if (event.type === "tool_execution_end") {
        emit({
          type: "tool_end",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
          summary: summarizeToolResult(event.result),
        });
      } else if (
        event.type === "message_update" &&
        event.assistantMessageEvent?.type === "text_delta"
      ) {
        const delta = event.assistantMessageEvent.delta ?? "";
        streamedText += delta;
        emit({ type: "text", delta });
      }
    });

    emit({ type: "status", phase: "investigating", detail: "Agent is analyzing the message…" });

    const prompt = buildUserPrompt(rawEmail, formatParsedForPrompt(parsed), {
      webToolsEnabled: usedWebTools,
    });
    await session.prompt(prompt);

    let assistantText = "";
    try {
      assistantText = extractAssistantText(session.messages ?? []) || streamedText;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message });
      throw err;
    }

    const report =
      parsePhishReport(assistantText) ??
      fallbackReportFromText(assistantText || "No response from agent.");

    if (!usedWebTools) {
      report.evidence = [
        ...report.evidence,
        {
          source: "email",
          detail: "Web tools were disabled or unavailable for this run.",
        },
      ];
    }

    emit({ type: "report", result: report });
    return { report, assistantText, usedWebTools };
  } finally {
    session.dispose();
  }
}
