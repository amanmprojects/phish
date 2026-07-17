import { IconRadar } from "../icons";
import type { TimelineItem } from "../types";
import { formatFlagType } from "../types";

function toolLabel(name: string) {
  const n = name.toLowerCase();
  if (n.includes("search")) return "Search";
  if (n.includes("fetch") || n.includes("browse")) return "Open page";
  return formatFlagType(name);
}

/** Merge tool_end into the matching tool_start so the UI shows one row per call. */
export function mergeTimelineItem(prev: TimelineItem[], item: TimelineItem): TimelineItem[] {
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
    if (item.status === "error") {
      if (idx < 0) return prev;
      return prev.filter((_, i) => i !== idx);
    }
    if (idx >= 0) {
      const cur = prev[idx];
      if (cur.kind !== "tool") return prev;
      const next = [...prev];
      next[idx] = {
        ...cur,
        status: item.status,
        at: item.at,
      };
      return next;
    }
    return prev;
  }
  if (item.kind === "status" && (item.phase === "investigating" || item.phase === "starting")) {
    if (prev.some((x) => x.kind === "status" && x.phase === item.phase)) return prev;
  }
  if (item.kind === "error") return prev;
  return [...prev, item];
}

export function InvestigationCard({
  timeline,
  investigating,
}: {
  timeline: TimelineItem[];
  investigating: boolean;
}) {
  return (
    <section className="card dark-card investigation-card" aria-live="polite" aria-busy={investigating}>
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
              Deep Investigate launches a research agent that can search the web and explain every red flag.
            </p>
          </div>
        ) : (
          <ul className="tool-list fade-in">
            {timeline
              .filter((item) => item.kind !== "error" && !(item.kind === "tool" && item.status === "error"))
              .map((item, i) => {
                if (item.kind === "status") {
                  return (
                    <li
                      key={`status-${item.phase}-${item.at}`}
                      className="tool-step status"
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                    >
                      <span className="tool-badge">{item.phase}</span>
                      <span className="tool-query">{item.detail ?? "Working…"}</span>
                    </li>
                  );
                }
                if (item.kind !== "tool") return null;
                return (
                  <li
                    key={item.toolCallId ?? `tool-${item.toolName}-${item.at}`}
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
                          <span className="spinner" aria-hidden />
                          Running
                        </>
                      ) : (
                        "Done"
                      )}
                    </span>
                  </li>
                );
              })}
            {investigating && !timeline.some((t) => t.kind === "tool" && t.status === "running") && (
              <li key="agent-working" className="tool-step running">
                <span className="tool-badge">Agent</span>
                <span className="tool-query muted">Analyzing results…</span>
                <span className="tool-status running">
                  <span className="spinner" aria-hidden />
                  Working
                </span>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
