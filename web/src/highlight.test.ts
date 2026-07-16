import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHighlightRanges, locateSnippet, segmentText } from "./highlight.ts";
import type { RedFlag } from "./types.ts";

test("locateSnippet exact and case-insensitive", () => {
  const text = "Pay ₹500 today immediately";
  assert.deepEqual(locateSnippet(text, "today"), { start: text.indexOf("today"), end: text.indexOf("today") + 5 });
  assert.ok(locateSnippet(text, "TODAY"));
});

test("buildHighlightRanges prefers higher severity on overlap", () => {
  const text = "Pay now immediately";
  const flags: RedFlag[] = [
    { type: "urgency", snippet: "now immediately", why: "", severity: "low" },
    { type: "payment_demand", snippet: "Pay now", why: "", severity: "high" },
  ];
  const ranges = buildHighlightRanges(text, flags);
  assert.ok(ranges.length >= 1);
  assert.equal(ranges[0]!.severity, "high");
});

test("segmentText marks active flag", () => {
  const text = "hello world today";
  const ranges = [{ start: 12, end: 17, flagIndex: 0, severity: "high" as const }];
  const segs = segmentText(text, ranges, 0);
  assert.ok(segs.some((s) => s.kind === "mark" && s.active));
});
