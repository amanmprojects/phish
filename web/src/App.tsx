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

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
      <path d="M9.5 12.2l1.8 1.8 3.7-4" />
    </svg>
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

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
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

function formatFlagType(type: string) {
  return type.replaceAll("_", " ");
}

export default function App() {
  const [email, setEmail] = useState("");
  const [fixtures, setFixtures] = useState<FixtureMeta[]>([]);
  const [activeFixture, setActiveFixture] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickCheckResult | null>(null);
  const [report, setReport] = useState<PhishReport | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [agentText, setAgentText] = useState("");
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
    setAgentText("");
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
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    setAgentText("");
    setQuick(null);

    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    try {
      await runDeepAnalyze(
        email,
        {
          onQuick: setQuick,
          onTimeline: (item) => setTimeline((t) => [...t, item]),
          onText: (delta) => setAgentText((t) => t + delta),
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
      `CampusGuard Report`,
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
        <nav className="nav">
          <div className="nav-brand">
            <div className="logo-mark" aria-hidden>
              <IconShield />
            </div>
            <div>
              <h1>CampusGuard</h1>
              <span>AI phishing radar for students</span>
            </div>
          </div>
          <div className="nav-pills">
            <span className="pill">
              <span className="dot" />
              Privacy first
            </span>
            <span className="pill">Pi agent · Tavily</span>
            <span className="pill">
              <span className="dot warn" />
              Demo mode
            </span>
          </div>
        </nav>

        <header className="hero">
          <div className="hero-kicker">
            <IconSpark />
            Know before you click
          </div>
          <h2>Spot scholarship scams in seconds</h2>
          <p>
            Paste a suspicious message. Get a risk score, highlighted red flags, and one clear safe
            next step — before you pay or share anything.
          </p>

          <ol className="hero-steps">
            <li>
              <span className="step-num">1</span>
              <span className="step-text">
                <strong>Paste</strong>
                <em>Email or SMS</em>
              </span>
            </li>
            <li className="step-divider" aria-hidden />
            <li>
              <span className="step-num">2</span>
              <span className="step-text">
                <strong>Scan</strong>
                <em>Quick or deep</em>
              </span>
            </li>
            <li className="step-divider" aria-hidden />
            <li>
              <span className="step-num">3</span>
              <span className="step-text">
                <strong>Act</strong>
                <em>One safe step</em>
              </span>
            </li>
          </ol>
        </header>

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

        <div className="results" ref={resultsRef}>
          <section className="card">
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
                <div className="empty-state">
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

          <section className="card investigation-card">
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
                <ul className="timeline fade-in">
                  {timeline.map((item, i) => (
                    <li
                      key={i}
                      className={`timeline-item${item.kind === "tool" ? " tool" : ""}${item.kind === "error" ? " error" : ""}`}
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                    >
                      <span className="rail-dot" />
                      {item.kind === "status" && (
                        <>
                          <div className="kind">status · {item.phase}</div>
                          <div className="body">{item.detail ?? "…"}</div>
                        </>
                      )}
                      {item.kind === "tool" && (
                        <>
                          <div className="kind">
                            tool · {item.toolName}
                            {item.isError ? " · error" : item.summary ? " · done" : " · start"}
                          </div>
                          <div className="body">
                            {item.summary
                              ? item.summary
                              : item.args
                                ? JSON.stringify(item.args).slice(0, 220)
                                : "…"}
                          </div>
                        </>
                      )}
                      {item.kind === "error" && (
                        <>
                          <div className="kind">error</div>
                          <div className="body">{item.message}</div>
                        </>
                      )}
                    </li>
                  ))}
                  {investigating && (
                    <li className="timeline-item live">
                      <span className="rail-dot" />
                      <div className="kind">
                        <span className="spinner" style={{ marginRight: 6, verticalAlign: -2 }} />
                        working
                      </div>
                      <div className="body muted">Agent is still investigating…</div>
                    </li>
                  )}
                </ul>
              )}
              {agentText && <pre className="agent-text">{agentText}</pre>}
            </div>
          </section>
        </div>

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
                {report && (
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
                )}
              </div>
            </div>

            {!report ? (
              <div className="empty-state">
                <div className="illus">
                  <IconFile />
                </div>
                <p>Your detailed risk report lands here after Deep Investigate finishes.</p>
              </div>
            ) : (
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
            )}
          </div>
        </section>

        <footer className="footer">
          <strong>CampusGuard</strong>
          <span className="footer-sep">·</span>
          mock messages only
          <span className="footer-sep">·</span>
          never paste real OTPs, passwords, or bank details
        </footer>
      </div>
    </>
  );
}
