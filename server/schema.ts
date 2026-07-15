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
}

export interface ParsedEmail {
  raw: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body: string;
  urls: string[];
  amounts: string[];
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
