export type RiskLabel = "Safe" | "Suspicious" | "High Risk";

export type RedFlagType =
  | "urgency"
  | "payment_demand"
  | "unknown_link"
  | "fake_authority"
  | "unrealistic_reward"
  | "credential_request"
  | "sender_mismatch"
  | "other";

export interface RedFlag {
  type: RedFlagType;
  snippet: string;
  why: string;
  severity: "low" | "medium" | "high";
}

export interface EvidenceItem {
  source: "email" | "web_search" | "web_fetch" | "heuristic";
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
  /** True when analysis ran without web_search/web_fetch. */
  text_only?: boolean;
}

export interface ParsedEmail {
  raw: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  replyTo?: string;
  fromDomain?: string;
  fromDisplayName?: string;
  body: string;
  urls: string[];
  amounts: string[];
  upiIds?: string[];
  urlHosts?: string[];
}

export interface QuickCheckResult {
  label: RiskLabel;
  score: number;
  flags: Array<{ type: RedFlagType; snippet: string; points: number }>;
  summary: string;
}

export type AgentEvent =
  | { type: "status"; phase: string; detail?: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_end"; toolCallId: string; toolName: string; isError: boolean; summary: string }
  | { type: "text"; delta: string }
  | { type: "quick"; result: QuickCheckResult }
  | { type: "report"; result: PhishReport }
  | { type: "error"; message: string }
  | { type: "done" };

export function scoreToLabel(score: number): RiskLabel {
  if (score >= 70) return "High Risk";
  if (score >= 35) return "Suspicious";
  return "Safe";
}

export function labelRank(label: RiskLabel): number {
  if (label === "High Risk") return 2;
  if (label === "Suspicious") return 1;
  return 0;
}

/**
 * Prefer the more cautious (higher-risk) signal between model label and score.
 * Ensures score falls in the chosen label's band.
 */
export function alignLabelAndScore(label: RiskLabel, score: number): { label: RiskLabel; score: number } {
  const s = Math.min(100, Math.max(0, Math.round(score)));
  const fromScore = scoreToLabel(s);
  const finalLabel = labelRank(label) >= labelRank(fromScore) ? label : fromScore;

  let aligned = s;
  if (finalLabel === "High Risk" && aligned < 70) aligned = 70;
  else if (finalLabel === "Suspicious") {
    if (aligned < 35) aligned = 35;
    if (aligned >= 70) aligned = 69;
  } else if (finalLabel === "Safe" && aligned >= 35) {
    aligned = 34;
  }

  return { label: finalLabel, score: aligned };
}

export function emptyReport(partial?: Partial<PhishReport>): PhishReport {
  return {
    label: "Suspicious",
    score: 50,
    summary: "Could not fully parse the agent report.",
    red_flags: [],
    evidence: [],
    safe_next_action:
      "Do not click links, pay, or share personal data until you verify via your official college portal.",
    what_not_to_do: [
      "Do not pay via UPI/links in the message",
      "Do not share OTP, password, or Aadhaar",
      "Do not click shortened or unknown links",
    ],
    ...partial,
  };
}
