import type { RedFlag } from "./types";

export interface HighlightRange {
  start: number;
  end: number;
  flagIndex: number;
  severity: "low" | "medium" | "high";
}

export type TextSegment =
  | { kind: "plain"; text: string }
  | { kind: "mark"; text: string; flagIndex: number; severity: "low" | "medium" | "high"; active: boolean };

const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function normalizeSeverity(s: string | undefined): "low" | "medium" | "high" {
  if (s === "high" || s === "medium" || s === "low") return s;
  return "medium";
}

/** Locate a flag snippet inside the email body (exact, then case-insensitive). */
export function locateSnippet(text: string, snippet: string): { start: number; end: number } | null {
  let snip = (snippet ?? "").trim();
  // Strip wrapping quotes the model sometimes adds
  snip = snip.replace(/^["'“”«»]|["'“”«»]$/g, "").trim();
  if (!snip || snip.length < 2) return null;

  let start = text.indexOf(snip);
  if (start >= 0) return { start, end: start + snip.length };

  const lower = text.toLowerCase();
  const snipLower = snip.toLowerCase();
  start = lower.indexOf(snipLower);
  if (start >= 0) return { start, end: start + snip.length };

  // Soft match: ignore extra whitespace differences
  const esc = snipLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  try {
    const re = new RegExp(esc, "i");
    const m = re.exec(text);
    if (m && m.index != null) return { start: m.index, end: m.index + m[0].length };
  } catch {
    /* ignore bad patterns */
  }

  return null;
}

/**
 * Build non-overlapping highlight ranges from report red flags.
 * Higher severity wins on overlap; longer snippets preferred within same severity.
 */
export function buildHighlightRanges(text: string, flags: RedFlag[]): HighlightRange[] {
  if (!text || !flags?.length) return [];

  const candidates: HighlightRange[] = [];
  const ordered = flags
    .map((f, flagIndex) => ({ f, flagIndex }))
    .sort((a, b) => {
      const ds = (SEV_RANK[a.f.severity] ?? 2) - (SEV_RANK[b.f.severity] ?? 2);
      if (ds !== 0) return ds;
      return (b.f.snippet?.length ?? 0) - (a.f.snippet?.length ?? 0);
    });

  for (const { f, flagIndex } of ordered) {
    const loc = locateSnippet(text, f.snippet ?? "");
    if (!loc) continue;
    candidates.push({
      start: loc.start,
      end: loc.end,
      flagIndex,
      severity: normalizeSeverity(f.severity),
    });
  }

  const kept: HighlightRange[] = [];
  for (const c of candidates) {
    const overlaps = kept.some((k) => c.start < k.end && c.end > k.start);
    if (!overlaps) kept.push(c);
  }

  return kept.sort((a, b) => a.start - b.start);
}

export function segmentText(
  text: string,
  ranges: HighlightRange[],
  activeFlagIndex: number | null,
): TextSegment[] {
  if (!ranges.length) return [{ kind: "plain", text }];

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const r of ranges) {
    if (r.start > cursor) {
      segments.push({ kind: "plain", text: text.slice(cursor, r.start) });
    }
    if (r.end > r.start) {
      segments.push({
        kind: "mark",
        text: text.slice(r.start, r.end),
        flagIndex: r.flagIndex,
        severity: r.severity,
        active: activeFlagIndex === r.flagIndex,
      });
    }
    cursor = Math.max(cursor, r.end);
  }

  if (cursor < text.length) {
    segments.push({ kind: "plain", text: text.slice(cursor) });
  }

  return segments;
}
