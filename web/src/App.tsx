import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { fetchFixtures, loadFixture, runDeepAnalyze, runQuickCheck } from "./api";
import type { FixtureMeta, PhishReport, QuickCheckResult, TimelineItem } from "./types";

function ringColor(label: string) {
  if (label === "Safe") return "var(--safe)";
  if (label === "Suspicious") return "var(--suspicious)";
  return "var(--high)";
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
        <p className="summary" style={{ marginTop: 10, marginBottom: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
          Risk confidence meter
        </p>
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchFixtures()
      .then(setFixtures)
      .catch(() => setFixtures([]));
  }, []);

  const onSelectFixture = useCallback(async (id: string) => {
    setActiveFixture(id);
    setError(null);
    try {
      const body = await loadFixture(id);
      setEmail(body);
      setQuick(null);
      setReport(null);
      setTimeline([]);
      setAgentText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleQuick = useCallback(async () => {
    if (!email.trim()) return;
    setBusy("quick");
    setError(null);
    try {
      const result = await runQuickCheck(email);
      setQuick(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [email]);

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

    try {
      await runDeepAnalyze(
        email,
        {
          onQuick: setQuick,
          onTimeline: (item) => setTimeline((t) => [...t, item]),
          onText: (delta) => setAgentText((t) => t + delta),
          onReport: setReport,
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
                <span className="char-count">{email.length.toLocaleString()} chars</span>
              </div>
              <textarea
                className="email-input"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setActiveFixture(null);
                }}
                placeholder={placeholder}
                spellCheck={false}
              />
            </div>

            <div className="samples-label">Try a sample</div>
            <div className="samples">
              {fixtures.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`chip${activeFixture === f.id ? " active" : ""}`}
                  onClick={() => void onSelectFixture(f.id)}
                  title={`Expected: ${f.expected}`}
                >
                  {shortTitle(f.title)}
                  <span className="expected">{f.expected}</span>
                </button>
              ))}
            </div>

            <div className="actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!email.trim() || busy !== null}
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
              <button
                type="button"
                className="btn btn-primary"
                disabled={!email.trim() || busy !== null}
                onClick={() => void handleDeep()}
              >
                {busy === "deep" ? (
                  <>
                    <span className="spinner" /> Investigating…
                  </>
                ) : (
                  <>
                    <IconSearch />
                    Deep Investigate
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="error-banner" role="alert">
                <IconAlert />
                <span>{error}</span>
              </div>
            )}
          </div>
        </section>

        <div className="results">
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

              {!quick ? (
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
                      <div className="section-label">Signals found</div>
                      <ul className="flag-list">
                        {quick.flags.map((f, i) => (
                          <li key={i} className="flag-item">
                            <div className="meta">
                              <span>{f.type.replaceAll("_", " ")}</span>
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

          <section className="card">
            <div className="card-inner">
              <div className="card-head">
                <h3 className="card-title">
                  <span className="icon">
                    <IconRadar />
                  </span>
                  Investigation
                </h3>
                <span className="card-hint">Agent · web verify</span>
              </div>

              {timeline.length === 0 && busy !== "deep" ? (
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
                  {busy === "deep" && (
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

        <section className="card report-card">
          <div className="card-inner">
            <div className="card-head">
              <h3 className="card-title">
                <span className="icon">
                  <IconFile />
                </span>
                Full report
              </h3>
              <span className="card-hint">Score · flags · next step</span>
            </div>

            {!report ? (
              <div className="empty-state">
                <div className="illus">
                  <IconFile />
                </div>
                <p>Your detailed risk report lands here after Deep Investigate finishes.</p>
              </div>
            ) : (
              <div className="fade-in">
                <div className="report-hero">
                  <ScoreBlock label={report.label} score={report.score} />
                  <p className="summary" style={{ flex: "1 1 240px", margin: 0 }}>
                    {report.summary}
                  </p>
                </div>

                {report.red_flags?.length > 0 && (
                  <>
                    <div className="section-label">Red flags</div>
                    <ul className="flag-list">
                      {report.red_flags.map((f, i) => (
                        <li key={i} className="flag-item">
                          <div className="meta">
                            <span>{f.type.replaceAll("_", " ")}</span>
                            <span className={`sev ${f.severity}`}>{f.severity}</span>
                          </div>
                          {f.snippet && <div className="snippet">“{f.snippet}”</div>}
                          <div className="why">{f.why}</div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {report.evidence?.length > 0 && (
                  <>
                    <div className="section-label">Evidence</div>
                    <ul className="evidence-list">
                      {report.evidence.map((e, i) => (
                        <li key={i} className="evidence-item">
                          <div className="src">
                            {e.source}
                            {e.url ? "" : ""}
                          </div>
                          <div className="detail">{e.detail}</div>
                          {e.url && <div className="url">{e.url}</div>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="next-action">
                  <div className="label">
                    <IconCheck />
                    Safe next step
                  </div>
                  <div className="text">{report.safe_next_action}</div>
                </div>

                {report.what_not_to_do?.length > 0 && (
                  <div className="dont-list">
                    {report.what_not_to_do.map((d, i) => (
                      <span key={i} className="dont-chip">
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <footer className="footer">
          <strong>CampusGuard</strong> · mock messages only · never paste real OTPs, passwords, or
          bank details
        </footer>
      </div>
    </>
  );
}
