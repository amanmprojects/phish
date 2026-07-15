export type RiskLabel = "Safe" | "Suspicious" | "High Risk";

export interface RedFlag {
  type: string;
  snippet: string;
  why: string;
  severity: "low" | "medium" | "high";
}

export interface EvidenceItem {
  source: string;
  detail: string;
  url?: string;
}

export interface PhishReport {
  label: RiskLabel;
  score: number;
  summary: string;
  red_flags: RedFlag[];
  evidence: EvidenceItem[];
  safe_next_action: string;
  what_not_to_do: string[];
}

export interface QuickCheckResult {
  label: RiskLabel;
  score: number;
  flags: Array<{ type: string; snippet: string; points: number }>;
  summary: string;
}

export interface FixtureMeta {
  id: string;
  title: string;
  expected: RiskLabel;
}

export type TimelineItem =
  | { kind: "status"; phase: string; detail?: string; at: number }
  | { kind: "tool"; toolName: string; args: unknown; summary?: string; isError?: boolean; at: number }
  | { kind: "error"; message: string; at: number };
