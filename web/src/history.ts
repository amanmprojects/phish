import type { HistoryEntry, PhishReport } from "./types";

const KEY = "phish.history.v1";
const MAX = 12;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(report: PhishReport, email: string): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    label: report.label,
    score: report.score,
    summary: report.summary.slice(0, 280),
    preview: email.replace(/\s+/g, " ").trim().slice(0, 120),
    safe_next_action: report.safe_next_action.slice(0, 200),
  };
  const next = [entry, ...loadHistory()].slice(0, MAX);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}

export function clearHistory(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
