import {
  alignLabelAndScore,
  emptyReport,
  type PhishReport,
  type RiskLabel,
} from "../schema.ts";

const LABELS = new Set<RiskLabel>(["Safe", "Suspicious", "High Risk"]);

function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 50;
  return Math.min(100, Math.max(0, Math.round(x)));
}

function normalizeLabel(v: unknown, score: number): RiskLabel {
  if (typeof v === "string" && LABELS.has(v as RiskLabel)) return v as RiskLabel;
  if (score >= 70) return "High Risk";
  if (score >= 35) return "Suspicious";
  return "Safe";
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function parsePhishReport(text: string): PhishReport | null {
  if (!text?.trim()) return null;

  // Prefer fenced json block
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fence?.[1]) candidates.push(fence[1].trim());

  // Fallback: last JSON object in the text
  const lastBrace = text.lastIndexOf("{");
  if (lastBrace >= 0) {
    const slice = text.slice(lastBrace);
    let depth = 0;
    let end = -1;
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > 0) candidates.push(slice.slice(0, end));
  }

  for (const raw of candidates) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const score = clampScore(obj.score);
      const label = normalizeLabel(obj.label, score);
      const aligned = alignLabelAndScore(label, score);

      const red_flags = asArray<Record<string, unknown>>(obj.red_flags).map((f) => ({
        type: (typeof f.type === "string" ? f.type : "other") as PhishReport["red_flags"][0]["type"],
        snippet: String(f.snippet ?? ""),
        why: String(f.why ?? ""),
        severity: (["low", "medium", "high"].includes(String(f.severity))
          ? String(f.severity)
          : "medium") as "low" | "medium" | "high",
      }));

      const evidence = asArray<Record<string, unknown>>(obj.evidence).map((e) => ({
        source: (typeof e.source === "string" ? e.source : "email") as PhishReport["evidence"][0]["source"],
        detail: String(e.detail ?? ""),
        url: e.url != null && e.url !== "" ? String(e.url) : undefined,
      }));

      return {
        label: aligned.label,
        score: aligned.score,
        summary: String(obj.summary ?? "").trim() || emptyReport().summary,
        red_flags,
        evidence,
        safe_next_action:
          String(obj.safe_next_action ?? "").trim() || emptyReport().safe_next_action,
        what_not_to_do: asArray<unknown>(obj.what_not_to_do).map(String).filter(Boolean),
      };
    } catch {
      // try next candidate
    }
  }

  return null;
}

/** If the agent produced prose but no JSON, build a weak report from text heuristics. */
export function fallbackReportFromText(text: string): PhishReport {
  const lower = text.toLowerCase();
  let score = 50;
  let label: RiskLabel = "Suspicious";
  if (/\bhigh\s*risk\b/.test(lower) || /\bphishing\b/.test(lower)) {
    score = 80;
    label = "High Risk";
  } else if (/\bsafe\b/.test(lower) && !/\bnot safe\b/.test(lower) && !/\bunsafe\b/.test(lower)) {
    score = 20;
    label = "Safe";
  }

  const aligned = alignLabelAndScore(label, score);

  return emptyReport({
    label: aligned.label,
    score: aligned.score,
    summary: text.slice(0, 400).trim() || emptyReport().summary,
    evidence: [{ source: "email", detail: "Agent did not return structured JSON; showing text fallback." }],
  });
}
