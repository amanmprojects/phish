import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchFixtures, loadFixture, runDeepAnalyze, runQuickCheck } from "./api";
import type { FixtureMeta, PhishReport, QuickCheckResult, TimelineItem } from "./types";

function RiskBadge({ label, score }: { label: string; score: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className="risk" data-label={label}>
        {label}
      </span>
      <span className="score">Score {score}/100</span>
    </div>
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
Subject: ...

Paste the full email (headers + body) here.`,
    [],
  );

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>CampusGuard</h1>
          <p>
            Paste a suspicious scholarship, fee, or placement message. Get a risk score, red flags,
            and one safe next step — with optional web verification.
          </p>
        </div>
        <div className="badge-row">
          <span className="badge">AI + Cyber Defense</span>
          <span className="badge">Pi agent · Tavily</span>
          <span className="badge">Not stored</span>
        </div>
      </header>

      <section className="panel">
        <h2>Message</h2>
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
        <div className="toolbar">
          <div className="samples">
            {fixtures.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`chip${activeFixture === f.id ? " active" : ""}`}
                onClick={() => void onSelectFixture(f.id)}
                title={`Expected: ${f.expected}`}
              >
                {f.title}
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
                "Quick Check"
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
                "Deep Investigate"
              )}
            </button>
          </div>
        </div>
        {error && (
          <p className="summary" style={{ color: "var(--high)" }}>
            {error}
          </p>
        )}
      </section>

      <div className="grid">
        <section className="panel">
          <h2>Quick Check</h2>
          {!quick ? (
            <p className="empty">Instant heuristic scan (no AI). Optional before deep investigate.</p>
          ) : (
            <>
              <RiskBadge label={quick.label} score={quick.score} />
              <p className="summary">{quick.summary}</p>
              {quick.flags.length > 0 && (
                <ul className="flag-list">
                  {quick.flags.map((f, i) => (
                    <li key={i} className="flag-item">
                      <div className="meta">
                        <span>{f.type.replaceAll("_", " ")}</span>
                        <span>+{f.points}</span>
                      </div>
                      <div className="snippet">“{f.snippet}”</div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="panel">
          <h2>Investigation</h2>
          {timeline.length === 0 && busy !== "deep" ? (
            <p className="empty">
              Deep Investigate runs a Pi agent with web search to verify claims and produce a full
              report.
            </p>
          ) : (
            <ul className="timeline">
              {timeline.map((item, i) => (
                <li key={i} className="timeline-item">
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
                <li className="timeline-item">
                  <div className="kind">
                    <span className="spinner" /> working
                  </div>
                  <div className="body muted">Agent is still investigating…</div>
                </li>
              )}
            </ul>
          )}
          {agentText && <pre className="agent-text">{agentText}</pre>}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Report</h2>
        {!report ? (
          <p className="empty">Full risk report appears here after Deep Investigate finishes.</p>
        ) : (
          <>
            <RiskBadge label={report.label} score={report.score} />
            <p className="summary">{report.summary}</p>

            {report.red_flags?.length > 0 && (
              <>
                <h2 style={{ marginTop: 18 }}>Red flags</h2>
                <ul className="flag-list">
                  {report.red_flags.map((f, i) => (
                    <li key={i} className="flag-item">
                      <div className="meta">
                        <span>
                          {f.type.replaceAll("_", " ")} · {f.severity}
                        </span>
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
                <h2 style={{ marginTop: 18 }}>Evidence</h2>
                <ul className="evidence-list">
                  {report.evidence.map((e, i) => (
                    <li key={i} className="evidence-item">
                      <div className="meta" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        {e.source}
                        {e.url ? ` · ${e.url}` : ""}
                      </div>
                      <div>{e.detail}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="next-action">
              <strong>Safe next step</strong>
              {report.safe_next_action}
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
          </>
        )}
      </section>

      <footer className="footer">
        Demo for students · mock messages only · do not paste real OTPs, passwords, or bank details
      </footer>
    </div>
  );
}
