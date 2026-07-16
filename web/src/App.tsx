import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { fetchFixtures, loadFixture, runDeepAnalyze, runQuickCheck } from "./api";
import { HighlightedEmail } from "./components/HighlightedEmail";
import { InvestigationCard, mergeTimelineItem } from "./components/InvestigationCard";
import { ReportCard } from "./components/ReportCard";
import { ScoreBlock } from "./components/ScoreBlock";
import { clearHistory, loadHistory, saveHistoryEntry } from "./history";
import {
  IconAlert,
  IconBolt,
  IconEdit,
  IconFile,
  IconMail,
  IconPhish,
  IconSearch,
  IconSettings,
  IconShield,
  IconX,
} from "./icons";
import { loadEnableWeb, saveEnableWeb } from "./settings";
import type {
  AppView,
  FixtureMeta,
  HistoryEntry,
  PhishReport,
  QuickCheckResult,
  TimelineItem,
} from "./types";
import { formatFlagType } from "./types";

export default function App() {
  const [view, setView] = useState<AppView>("analyze");
  const [email, setEmail] = useState("");
  const [fixtures, setFixtures] = useState<FixtureMeta[]>([]);
  const [activeFixture, setActiveFixture] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickCheckResult | null>(null);
  const [report, setReport] = useState<PhishReport | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [busy, setBusy] = useState<"quick" | "deep" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusedFlagIndex, setFocusedFlagIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [enableWeb, setEnableWeb] = useState(loadEnableWeb);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [statusLive, setStatusLive] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 12;

    const load = () => {
      fetchFixtures()
        .then((list) => {
          if (!cancelled) setFixtures(list);
        })
        .catch(() => {
          // API may still be starting under concurrently — retry briefly
          attempt += 1;
          if (!cancelled && attempt < maxAttempts) {
            setTimeout(load, 400 + attempt * 100);
          } else if (!cancelled) {
            setFixtures([]);
          }
        });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetResults = useCallback(() => {
    setQuick(null);
    setReport(null);
    setTimeline([]);
    setFocusedFlagIndex(null);
    setEditing(false);
  }, []);

  const onFocusFlag = useCallback((index: number | null) => {
    setFocusedFlagIndex(index);
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

  const handleEdit = useCallback(() => {
    setEditing(true);
    setFocusedFlagIndex(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleQuick = useCallback(async () => {
    if (!email.trim()) return;
    setBusy("quick");
    setError(null);
    setStatusLive("Running quick check…");
    try {
      const result = await runQuickCheck(email);
      setQuick(result);
      setStatusLive(`Quick check complete: ${result.label}, score ${result.score}`);
      requestAnimationFrame(() => {
        textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatusLive("Quick check failed");
    } finally {
      setBusy(null);
    }
  }, [email]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(null);
    setStatusLive("Analysis cancelled");
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
    setEditing(false);
    setFocusedFlagIndex(null);
    setStatusLive("Deep investigate started");
    setView("analyze");

    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    try {
      await runDeepAnalyze(
        email,
        {
          onQuick: setQuick,
          onTimeline: (item) => {
            setTimeline((t) => mergeTimelineItem(t, item));
            if (item.kind === "status" && item.detail) setStatusLive(item.detail);
            if (item.kind === "tool" && item.status === "running") {
              setStatusLive(`${item.toolName}: ${item.query || "running"}`);
            }
          },
          onText: undefined,
          onReport: (r) => {
            setReport(r);
            setFocusedFlagIndex(null);
            setHistory(saveHistoryEntry(r, email));
            setStatusLive(`Report ready: ${r.label}, score ${r.score}`);
          },
          onError: (message) => {
            setError(message);
            setStatusLive(message);
          },
        },
        ac.signal,
        { enableWeb },
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
        setStatusLive("Deep investigate failed");
      }
    } finally {
      setBusy(null);
    }
  }, [email, enableWeb]);

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
  const modKey =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const reviewMode = Boolean(report) && !editing;

  const toggleWeb = (on: boolean) => {
    setEnableWeb(on);
    saveEnableWeb(on);
  };

  const investigationCard = (
    <InvestigationCard timeline={timeline} investigating={investigating} />
  );

  return (
    <>
      <div className="bg-scene" aria-hidden>
        <div className="bg-orb a" />
        <div className="bg-orb b" />
        <div className="bg-orb c" />
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {statusLive}
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
              <button
                type="button"
                className={`side-nav-btn${view === "analyze" ? " active" : ""}`}
                title="Analyze"
                aria-label="Analyze"
                aria-current={view === "analyze" ? "page" : undefined}
                onClick={() => setView("analyze")}
              >
                <IconShield />
              </button>
              <button
                type="button"
                className={`side-nav-btn${view === "history" ? " active" : ""}`}
                title="History"
                aria-label="History"
                aria-current={view === "history" ? "page" : undefined}
                onClick={() => setView("history")}
              >
                <IconFile />
              </button>
              <button
                type="button"
                className={`side-nav-btn${view === "settings" ? " active" : ""}`}
                title="Settings"
                aria-label="Settings"
                aria-current={view === "settings" ? "page" : undefined}
                onClick={() => setView("settings")}
              >
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
                <h1>
                  {view === "analyze" ? "Analyze" : view === "history" ? "History" : "Settings"}
                </h1>
                <p>
                  {view === "analyze"
                    ? "Paste a suspicious message · risk score · safe next step"
                    : view === "history"
                      ? "Recent reports this session (not uploaded)"
                      : "Local preferences for Deep Investigate"}
                </p>
              </div>
              <div className="topbar-actions">
                <span className="meta-pill">
                  <span className="dot" />
                  Never stored
                </span>
                {!enableWeb && view === "analyze" && (
                  <span className="meta-pill warn-pill">Web off</span>
                )}
              </div>
            </header>

            {view === "settings" && (
              <section className="card settings-card">
                <div className="card-inner">
                  <div className="card-head">
                    <h3 className="card-title">
                      <span className="icon">
                        <IconSettings />
                      </span>
                      Deep Investigate
                    </h3>
                  </div>
                  <label className="toggle-row">
                    <div>
                      <div className="toggle-title">Web verification (Tavily)</div>
                      <p className="toggle-desc">
                        Allow the agent to search and open pages. Turn off for text-only analysis.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableWeb}
                      onChange={(e) => toggleWeb(e.target.checked)}
                      aria-label="Enable web verification"
                    />
                  </label>
                  <p className="settings-note">
                    Emails are not persisted on the server. History lives only in this browser tab
                    (session storage).
                  </p>
                </div>
              </section>
            )}

            {view === "history" && (
              <section className="card history-card">
                <div className="card-inner">
                  <div className="card-head">
                    <h3 className="card-title">
                      <span className="icon">
                        <IconFile />
                      </span>
                      Session history
                    </h3>
                    {history.length > 0 && (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          clearHistory();
                          setHistory([]);
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {history.length === 0 ? (
                    <div className="empty-state compact">
                      <p>Run Deep Investigate to keep a short local history of labels and scores.</p>
                    </div>
                  ) : (
                    <ul className="history-list">
                      {history.map((h) => (
                        <li key={h.id} className="history-item">
                          <div className="history-meta">
                            <span className="risk" data-label={h.label}>
                              {h.label}
                            </span>
                            <span className="history-score">{h.score}/100</span>
                            <span className="history-time">
                              {new Date(h.at).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="history-summary">{h.summary}</p>
                          <p className="history-preview">{h.preview}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {view === "analyze" && (
              <div className="workspace">
                <div className="compose-col">
                  <section className="card compose">
                    <div className="card-inner">
                      <div className="card-head">
                        <h3 className="card-title">
                          <span className="icon">
                            <IconMail />
                          </span>
                          {reviewMode ? "Message review" : "Message to analyze"}
                        </h3>
                        <span className="card-hint">
                          {reviewMode ? "Highlighted · read-only" : "Headers + body · never stored"}
                        </span>
                      </div>

                      <div className={`email-shell${reviewMode ? " review" : ""}`}>
                        <div className="email-shell-bar">
                          <span className="meta">
                            {reviewMode ? "Risk highlights in context" : "Raw email / SMS paste"}
                          </span>
                          <div className="shell-actions">
                            <span className="char-count">{email.length.toLocaleString()} chars</span>
                            {reviewMode && (
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={handleEdit}
                                title="Edit message and re-run"
                              >
                                <IconEdit />
                                Edit
                              </button>
                            )}
                            {hasContent && (
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={handleClear}
                                title={reviewMode ? "Clear and analyze another" : "Clear message"}
                              >
                                <IconX />
                                {reviewMode ? "New" : "Clear"}
                              </button>
                            )}
                          </div>
                        </div>
                        {reviewMode && report ? (
                          <HighlightedEmail
                            text={email}
                            flags={report.red_flags ?? []}
                            activeFlagIndex={focusedFlagIndex}
                            onFocusFlag={onFocusFlag}
                          />
                        ) : (
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
                        )}
                      </div>

                      {(!reviewMode || editing) && (
                        <>
                          {!reviewMode && (
                            <div className="samples-row">
                              <div className="samples-label">Try a sample</div>
                              <div className="samples">
                                {fixtures.map((f) => (
                                  <button
                                    key={f.id}
                                    type="button"
                                    className={`chip${activeFixture === f.id ? " active" : ""}`}
                                    onClick={() => void onSelectFixture(f.id)}
                                  >
                                    {shortTitle(f.title)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

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
                                {editing ? "Re-run Deep" : "Deep Investigate"}
                                <kbd className="hotkey">{modKey}+↵</kbd>
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {error && (
                        <div className="error-banner" role="alert">
                          <IconAlert />
                          <span>{error}</span>
                          <button
                            type="button"
                            className="ghost-btn error-dismiss"
                            onClick={() => setError(null)}
                            aria-label="Dismiss error"
                          >
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
                          <p>
                            Run a lightning scan for urgency, payments, and shady links — no AI
                            required.
                          </p>
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
                                  <li
                                    key={i}
                                    className="flag-item"
                                    style={{ animationDelay: `${i * 40}ms` }}
                                  >
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

                  {report && investigationCard}
                </div>

                <div className="results" ref={resultsRef}>
                  {report && (
                    <ReportCard
                      report={report}
                      quick={quick}
                      focusedFlagIndex={focusedFlagIndex}
                      onFocusFlag={onFocusFlag}
                    />
                  )}
                  {!report && investigationCard}
                </div>
              </div>
            )}
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
