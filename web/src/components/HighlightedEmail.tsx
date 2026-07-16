import { useMemo } from "react";
import { buildHighlightRanges, segmentText } from "../highlight";
import type { RedFlag } from "../types";
import { formatFlagType } from "../types";

/** Grammarly-style immutable email with severity highlights. */
export function HighlightedEmail({
  text,
  flags,
  activeFlagIndex,
  onFocusFlag,
}: {
  text: string;
  flags: RedFlag[];
  activeFlagIndex: number | null;
  onFocusFlag: (index: number | null) => void;
}) {
  const ranges = useMemo(() => buildHighlightRanges(text, flags), [text, flags]);
  const segments = useMemo(
    () => segmentText(text, ranges, activeFlagIndex),
    [text, ranges, activeFlagIndex],
  );
  const matched = ranges.length;

  return (
    <div className="email-highlight-wrap">
      <div
        className="email-highlight"
        role="article"
        aria-label="Analyzed message with risk highlights"
        aria-readonly="true"
      >
        {segments.map((seg, i) => {
          if (seg.kind === "plain") {
            return <span key={i}>{seg.text}</span>;
          }
          const flag = flags[seg.flagIndex];
          const title = flag
            ? `${formatFlagType(flag.type)} · ${flag.severity}${flag.why ? ` — ${flag.why}` : ""}`
            : "Risk signal";
          return (
            <mark
              key={i}
              className={`hl hl-${seg.severity}${seg.active ? " hl-active" : ""}`}
              title={title}
              data-flag={seg.flagIndex}
              onMouseEnter={() => onFocusFlag(seg.flagIndex)}
              onMouseLeave={() => onFocusFlag(null)}
              onFocus={() => onFocusFlag(seg.flagIndex)}
              onBlur={() => onFocusFlag(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFocusFlag(seg.flagIndex);
                }
                if (e.key === "Escape") onFocusFlag(null);
              }}
              tabIndex={0}
              role="button"
              aria-label={title}
            >
              {seg.text}
            </mark>
          );
        })}
      </div>
      {matched > 0 && (
        <div className="hl-legend">
          <span className="hl-swatch high" /> High
          <span className="hl-swatch medium" /> Medium
          <span className="hl-swatch low" /> Low
          <span className="hl-legend-hint">Hover or focus a highlight to jump the flag</span>
        </div>
      )}
    </div>
  );
}
