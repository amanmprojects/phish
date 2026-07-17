import { useMemo, useRef, useState } from "react";
import { IconBan, IconCheck, IconCopy, IconFile, IconLink, IconX } from "../icons";
import type { PhishReport, QuickCheckResult, RedFlag } from "../types";
import { formatFlagType, labelRank } from "../types";
import { ScoreBlock } from "./ScoreBlock";

export function ReportCard({
  report,
  quick,
  focusedFlagIndex,
  onFocusFlag,
}: {
  report: PhishReport;
  quick: QuickCheckResult | null;
  focusedFlagIndex: number | null;
  onFocusFlag: (index: number | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const flagItemRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const reportRef = useRef<HTMLElement | null>(null);

  /** Stable order — never reorder under the cursor (hover thrash). */
  const orderedRedFlags = useMemo(() => {
    if (!report.red_flags?.length) return [] as Array<{ flag: RedFlag; index: number }>;
    return report.red_flags.map((flag, index) => ({ flag, index }));
  }, [report]);

  const disagreement =
    quick && labelRank(quick.label) !== labelRank(report.label)
      ? {
          quick: quick.label,
          deep: report.label,
          higher: labelRank(quick.label) > labelRank(report.label) ? "quick" : "deep",
        }
      : null;

  const handleCopy = async () => {
    const lines = [
      `Phish Report`,
      `Label: ${report.label}`,
      `Score: ${report.score}/100`,
      ``,
      report.summary,
      ``,
      `Safe next step:`,
      report.safe_next_action,
    ];
    if (report.red_flags?.length) {
      lines.push(``, `Red flags:`);
      for (const f of report.red_flags) {
        lines.push(`- [${f.severity}] ${formatFlagType(f.type)}: ${f.why}`);
      }
    }
    if (report.what_not_to_do?.length) {
      lines.push(``, `Do not:`, ...report.what_not_to_do.map((d) => `- ${d}`));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* parent may show error if needed */
    }
  };

  const setFocus = (index: number | null) => {
    onFocusFlag(index);
    if (index == null) return;
    requestAnimationFrame(() => {
      flagItemRefs.current.get(index)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  return (
    <section
      className="card report-card"
      ref={reportRef}
      aria-live="polite"
      aria-label={`Full report: ${report.label}, score ${report.score}`}
    >
      <div className="card-inner">
        <div className="card-head">
          <h3 className="card-title">
            <span className="icon">
              <IconFile />
            </span>
            Full report
          </h3>
          <div className="card-head-right">
            <span className="card-hint">Score · flags · next step</span>
            <button type="button" className="ghost-btn" onClick={() => void handleCopy()}>
              {copied ? (
                <>
                  <IconCheck />
                  Copied
                </>
              ) : (
                <>
                  <IconCopy />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        <div className="fade-in report-body">
          {report.text_only && (
            <div className="info-banner text-only" role="status">
              Text-only analysis — web verification was off or unavailable. Treat claims as unverified.
            </div>
          )}

          {disagreement && (
            <div className="info-banner disagree" role="status">
              Quick Check said <strong>{disagreement.quick}</strong>, Deep Investigate said{" "}
              <strong>{disagreement.deep}</strong>. Prefer the higher-risk result until you verify on
              an official channel.
            </div>
          )}

          <div className="report-hero">
            <ScoreBlock label={report.label} score={report.score} />
            <p className="summary report-summary">{report.summary}</p>
          </div>

          <div className="report-grid">
            {orderedRedFlags.length > 0 && (
              <div className="report-col">
                <div className="section-label">
                  Red flags
                  <span className="section-count">{orderedRedFlags.length}</span>
                </div>
                <ul
                  className={`flag-list${focusedFlagIndex != null ? " is-focusing" : ""}`}
                  onMouseLeave={() => onFocusFlag(null)}
                >
                  {orderedRedFlags.map(({ flag: f, index: i }) => (
                    <li
                      key={i}
                      ref={(el) => {
                        if (el) flagItemRefs.current.set(i, el);
                        else flagItemRefs.current.delete(i);
                      }}
                      className={`flag-item sev-border-${f.severity}${focusedFlagIndex === i ? " flag-focused" : ""}`}
                      onMouseEnter={() => setFocus(i)}
                      onFocus={() => setFocus(i)}
                      onBlur={() => onFocusFlag(null)}
                      tabIndex={0}
                    >
                      <div className="meta">
                        <span>{formatFlagType(f.type)}</span>
                        <span className={`sev ${f.severity}`}>{f.severity}</span>
                      </div>
                      {f.snippet && <div className="snippet">“{f.snippet}”</div>}
                      <div className="why">{f.why}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.evidence?.length > 0 && (
              <div className="report-col">
                <div className="section-label">
                  Evidence
                  <span className="section-count">{report.evidence.length}</span>
                </div>
                <ul className="evidence-list">
                  {report.evidence.map((e, i) => (
                    <li key={i} className="evidence-item" style={{ animationDelay: `${i * 40}ms` }}>
                      <div className="src">
                        <IconLink />
                        {e.source}
                      </div>
                      <div className="detail">{e.detail}</div>
                      {e.url && (
                        <a
                          className="url"
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Opens in a new tab — verify the host before trusting it"
                        >
                          {e.url}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="next-action">
            <div className="label">
              <IconCheck />
              Safe next step
            </div>
            <div className="text">{report.safe_next_action}</div>
          </div>

          {report.what_not_to_do?.length > 0 && (
            <div className="dont-section">
              <div className="section-label">
                <IconBan />
                What not to do
              </div>
              <div className="dont-list">
                {report.what_not_to_do.map((d, i) => (
                  <span key={i} className="dont-chip">
                    <IconX />
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
