import type { CSSProperties } from "react";

function ringColor(label: string) {
  if (label === "Safe") return "var(--safe)";
  if (label === "Suspicious") return "var(--suspicious)";
  return "var(--high)";
}

export function ScoreBlock({ label, score }: { label: string; score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="score-row fade-in">
      <div
        className="score-ring"
        style={
          {
            "--pct": pct,
            "--ring": ringColor(label),
          } as CSSProperties
        }
        role="img"
        aria-label={`Risk score ${score} out of 100, label ${label}`}
      >
        <div className="val">
          <span className="num">{score}</span>
          <span className="den">/ 100</span>
        </div>
      </div>
      <div className="score-meta">
        <span className="risk" data-label={label}>
          <span className="pulse" />
          {label}
        </span>
        <p className="score-caption">Risk confidence meter</p>
      </div>
    </div>
  );
}
