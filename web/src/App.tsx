import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { fetchFixtures, loadFixture, runDeepAnalyze, runQuickCheck } from "./api";
import type { FixtureMeta, PhishReport, QuickCheckResult, RiskLabel, TimelineItem } from "./types";

function ringColor(label: string) {
  if (label === "Safe") return "var(--safe)";
  if (label === "Suspicious") return "var(--suspicious)";
  return "var(--high)";
}

function expectedTone(label: RiskLabel): "safe" | "suspicious" | "high" {
  if (label === "Safe") return "safe";
  if (label === "Suspicious") return "suspicious";
  return "high";
}

function ScoreBlock({ label, score }: { label: string; score: number }) {
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
        aria-label={`Risk score ${score} out of 100`}
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

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 10-14h-7l0-6z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function IconRadar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3v3M12 12l5-5" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 4.3L2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function IconBan() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M6.5 6.5l11 11" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function IconPhish() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
      <circle cx="12" cy="11" r="2.5" />
      <path d="M12 13.5V17" />
    </svg>
  );
}

function formatFlagType(type: string) {
  return type.replaceAll("_", " ");
}

function toolLabel(name: string) {
  const n = name.toLowerCase();
  if (n.includes("search")) return "Search";
  if (n.includes("fetch") || n.includes("browse")) return "Open page";
  return formatFlagType(name);
}

/** Merge tool_end into the matching tool_start so the UI shows one row per call. */
function mergeTimelineItem(prev: TimelineItem[], item: TimelineItem): TimelineItem[] {
  if (item.kind === "tool" && item.status !== "running") {
    let idx = -1;
    if (item.toolCallId) {
      idx = prev.findIndex(
        (x) => x.kind === "tool" && x.toolCallId === item.toolCallId && x.status === "running",
      );
    }
    if (idx < 0) {
      for (let i = prev.length - 1; i >= 0; i--) {
        const x = prev[i];
        if (x.kind === "tool" && x.status === "running" && x.toolName === item.toolName) {
          idx = i;
          break;
        }
      }
    }
    if (idx >= 0) {
      const cur = prev[idx];
      if (cur.kind !== "tool") return [...prev, item];
      const next = [...prev];
      next[idx] = {
        ...cur,
        status: item.status,
        at: item.at,
      };
      return next;
    }
  }
  // Skip noisy status lines that only clutter the log
  if (item.kind === "status" && (item.phase === "investigating" || item.phase === "starting")) {
    // keep a single status if empty; otherwise skip duplicates of working state
    if (prev.some((x) => x.kind === "status" && x.phase === item.phase)) return prev;
  }
  return [...prev, item];
}

export default function App() {
  const [email, setEmail] = useState("");
  const [fixtures, setFixtures] = useState<FixtureMeta[]>([]);
  const [activeFixture, setActiveFixture] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickCheckResult | null>(null);
  const [report, setReport] = useState<PhishReport | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [busy, setBusy] = useState<"quick" | "deep" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const reportRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    fetchFixtures()
      .then(setFixtures)
      .catch(() => setFixtures([]));
  }, []);

  const resetResults = useCallback(() => {
    setQuick(null);
    setReport(null);
    setTimeline([]);
  }, []);

  const onSelectFixture = useCallback(
    async (id: string) => {
      setActiveFixture(id);
      setError(null);
      try {
        const body = await loadFixture(id);
        setEmail(body);
        resetResults();
        textareaRef.current?.focus();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [resetResults],
  );

  const handleClear = useCallback(() => {
    setEmail("");
    setActiveFixture(null);
    setError(null);
    resetResults();
    textareaRef.current?.focus();
  }, [resetResults]);

  const handleQuick = useCallback(async () => {
    if (!email.trim()) return;
    setBusy("quick");
    setError(null);
    try {
      const result = await runQuickCheck(email);
      setQuick(result);
      requestAnimationFrame(() => {
        // Quick check lives under the message box — keep view on compose column
        textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [email]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(null);
  }, []);

  const handleDeep = useCallback(async () => {
    if (!email.trim()) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setBusy("deep");
    setError(null);
    setReport(null);
    setTimeline([]);
    setQuick(null);

    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    try {
      await runDeepAnalyze(
        email,
        {
          onQuick: setQuick,
          onTimeline: (item) => setTimeline((t) => mergeTimelineItem(t, item)),
          // Agent stream often includes raw JSON — keep Investigation query-only
          onText: undefined,
          onReport: (r) => {
            setReport(r);
            requestAnimationFrame(() => {
              reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          },
          onError: (message) => setError(message),
        },
        ac.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
    }
  }, [email]);

  const handleCopyReport = useCallback(async () => {
    if (!report) return;
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
      setError("Could not copy to clipboard");
    }
  }, [report]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!email.trim() || busy) return;
        void handleDeep();
      }
    },
    [email, busy, handleDeep],
  );

  const placeholder = useMemo(
    () =>
      `From: sender@example.com
To: you@student.com
Subject: Confirm scholarship eligibility…

Paste the full email — headers and body.`,
    [],
  );

  const shortTitle = (title: string) =>
    title
      .replace(/\s*\((High Risk|Suspicious|Safe)\)\s*$/i, "")
      .trim();

  const hasContent = email.trim().length > 0;
  const investigating = busy === "deep";
  const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <>
      <div className="bg-scene" aria-hidden>
        <div className="bg-orb a" />
        <div className="bg-orb b" />
        <div className="bg-orb c" />
      </div>

      <div className="app">
        <div className="shell">
          <aside className="sidebar" aria-label="Primary">
            <div className="brand">
              <div className="brand-mark" aria-hidden>
                <IconPhish />
              </div>
              <span className="brand-name">Phish</span>
            </div>

            <nav className="side-nav" aria-label="Sections">
              <button type="button" className="side-nav-btn" title="Home" aria-label="Home" tabIndex={-1}>
                <IconHome />
              </button>
              <button type="button" className="side-nav-btn active" title="Analyze" aria-label="Analyze" aria-current="page">
                <IconShield />
              </button>
              <button type="button" className="side-nav-btn" title="Reports" aria-label="Reports" tabIndex={-1}>
                <IconFile />
              </button>
              <button type="button" className="side-nav-btn" title="Settings" aria-label="Settings" tabIndex={-1}>
                <IconSettings />
              </button>
            </nav>

            <div className="side-footer">
              <div className="side-avatar" aria-hidden>
                AI
              </div>
              <span className="side-hint">Local only</span>
            </div>
          </aside>

          <div className="main-panel">
            <header className="topbar">
              <div className="topbar-left">
                <h1>Analyze</h1>
                <p>Paste a suspicious message · risk score · safe next step</p>
              </div>
              <div className="topbar-actions">
                <span className="meta-pill">
                  <span className="dot" />
                  Never stored
                </span>
                <span className="icon-pill dark" aria-hidden>
                  <IconSearch />
                </span>
                <span className="icon-pill" aria-hidden>
                  <IconBell />
                </span>
              </div>
            </header>

            <div className="workspace">
              <div className="compose-col">
                <section className="card compose">
                  <div className="card-inner">
                    <div className="card-head">
                      <h3 className="card-title">
                        <span className="icon">
                          <IconMail />
                        </span>
                        Message to analyze
                      </h3>
                      <span className="card-hint">Headers + body · never stored</span>
                    </div>

                    <div className="email-shell">
                      <div className="email-shell-bar">
                        <span className="meta">Raw email / SMS paste</span>
                        <div className="shell-actions">
                          <span className="char-count">{email.length.toLocaleString()} chars</span>
                          {hasContent && (
                            <button type="button" className="ghost-btn" onClick={handleClear} title="Clear message">
                              <IconX />
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      <textarea
                        ref={textareaRef}
                        className="email-input"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setActiveFixture(null);
                        }}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        spellCheck={false}
                        aria-label="Email or SMS content to analyze"
                      />
                    </div>

                    <div className="samples-row">
                      <div className="samples-label">Try a sample</div>
                      <div className="samples">
                        {fixtures.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className={`chip tone-${expectedTone(f.expected)}${activeFixture === f.id ? " active" : ""}`}
                            onClick={() => void onSelectFixture(f.id)}
                            title={`Expected: ${f.expected}`}
                          >
                            <span className="chip-dot" />
                            {shortTitle(f.title)}
                            <span className="expected">{f.expected}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!hasContent || busy !== null}
                        onClick={() => void handleQuick()}
                      >
                        {busy === "quick" ? (
                          <>
                            <span className="spinner" /> Checking…
                          </>
                        ) : (
                          <>
                            <IconBolt />
                            Quick Check
                          </>
                        )}
                      </button>
                      {investigating ? (
                        <button type="button" className="btn btn-danger" onClick={handleCancel}>
                          <IconX />
                          Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!hasContent || busy !== null}
                          onClick={() => void handleDeep()}
                        >
                          <IconSearch />
                          Deep Investigate
                          <kbd className="hotkey">{modKey}+↵</kbd>
                        </button>
                      )}
                    </div>

                    {error && (
                      <div className="error-banner" role="alert">
                        <IconAlert />
                        <span>{error}</span>
                        <button type="button" className="ghost-btn error-dismiss" onClick={() => setError(null)} aria-label="Dismiss error">
                          <IconX />
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                <section className="card quick-card">
                  <div className="card-inner">
                    <div className="card-head">
                      <h3 className="card-title">
                        <span className="icon">
                          <IconBolt />
                        </span>
                        Quick Check
                      </h3>
                      <span className="card-hint">Instant · rules only</span>
                    </div>

                    {busy === "quick" ? (
                      <div className="skeleton-stack" aria-busy="true" aria-label="Running quick check">
                        <div className="skeleton ring" />
                        <div className="skeleton line w80" />
                        <div className="skeleton line w60" />
                        <div className="skeleton block" />
                      </div>
                    ) : !quick ? (
                      <div className="empty-state compact">
                        <div className="illus">
                          <IconBolt />
                        </div>
                        <p>Run a lightning scan for urgency, payments, and shady links — no AI required.</p>
                      </div>
                    ) : (
                      <div className="fade-in">
                        <ScoreBlock label={quick.label} score={quick.score} />
                        <p className="summary">{quick.summary}</p>
                        {quick.flags.length > 0 && (
                          <>
                            <div className="section-label">
                              Signals found
                              <span className="section-count">{quick.flags.length}</span>
                            </div>
                            <ul className="flag-list">
                              {quick.flags.map((f, i) => (
                                <li key={i} className="flag-item" style={{ animationDelay: `${i * 40}ms` }}>
                                  <div className="meta">
                                    <span>{formatFlagType(f.type)}</span>
                                    <span className="sev medium">+{f.points}</span>
                                  </div>
                                  <div className="snippet">“{f.snippet}”</div>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="results" ref={resultsRef}>
                {report && (
                  <section className="card report-card" ref={reportRef}>
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
                          <button type="button" className="ghost-btn" onClick={() => void handleCopyReport()}>
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
                        <div className="report-hero">
                          <ScoreBlock label={report.label} score={report.score} />
                          <p className="summary report-summary">{report.summary}</p>
                        </div>

                        <div className="report-grid">
                          {report.red_flags?.length > 0 && (
                            <div className="report-col">
                              <div className="section-label">
                                Red flags
                                <span className="section-count">{report.red_flags.length}</span>
                              </div>
                              <ul className="flag-list">
                                {report.red_flags.map((f, i) => (
                                  <li key={i} className={`flag-item sev-border-${f.severity}`} style={{ animationDelay: `${i * 40}ms` }}>
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
                                      <a className="url" href={e.url} target="_blank" rel="noopener noreferrer">
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
                )}

                <section className="card dark-card investigation-card">
                  <div className="card-inner">
                    <div className="card-head">
                      <h3 className="card-title">
                        <span className={`icon${investigating ? " live" : ""}`}>
                          <IconRadar />
                        </span>
                        Investigation
                      </h3>
                      <span className="card-hint">
                        {investigating ? (
                          <span className="live-hint">
                            <span className="live-dot" />
                            Live
                          </span>
                        ) : (
                          "Agent · web verify"
                        )}
                      </span>
                    </div>

                    {timeline.length === 0 && !investigating ? (
                      <div className="empty-state">
                        <div className="illus">
                          <IconRadar />
                        </div>
                        <p>
                          Deep Investigate launches a research agent that can search the web and explain
                          every red flag.
                        </p>
                      </div>
                    ) : (
                      <ul className="tool-list fade-in">
                        {timeline.map((item, i) => {
                          if (item.kind === "status") {
                            return (
                              <li key={`s-${i}`} className="tool-step status" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                                <span className="tool-badge">{item.phase}</span>
                                <span className="tool-query">{item.detail ?? "Working…"}</span>
                              </li>
                            );
                          }
                          if (item.kind === "error") {
                            return (
                              <li key={`e-${i}`} className="tool-step error" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                                <span className="tool-badge">Error</span>
                                <span className="tool-query">{item.message}</span>
                              </li>
                            );
                          }
                          // tool — one row: Search / Open page + query + status
                          return (
                            <li
                              key={item.toolCallId ?? `t-${i}`}
                              className={`tool-step ${item.status}`}
                              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                            >
                              <span className="tool-badge">{toolLabel(item.toolName)}</span>
                              <span className="tool-query" title={item.query}>
                                {item.query || "…"}
                              </span>
                              <span className={`tool-status ${item.status}`}>
                                {item.status === "running" ? (
                                  <>
                                    <span className="spinner" />
                                    Running
                                  </>
                                ) : item.status === "error" ? (
                                  "Failed"
                                ) : (
                                  "Done"
                                )}
                              </span>
                            </li>
                          );
                        })}
                        {investigating && !timeline.some((t) => t.kind === "tool" && t.status === "running") && (
                          <li className="tool-step running">
                            <span className="tool-badge">Agent</span>
                            <span className="tool-query muted">Analyzing results…</span>
                            <span className="tool-status running">
                              <span className="spinner" />
                              Working
                            </span>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        <footer className="footer">
          <strong>Phish</strong>
          <span className="footer-sep">·</span>
          mock messages only
          <span className="footer-sep">·</span>
          never paste real OTPs, passwords, or bank details
        </footer>
      </div>
    </>
  );
}
