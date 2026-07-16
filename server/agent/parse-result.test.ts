import assert from "node:assert/strict";
import { test } from "node:test";
import { alignLabelAndScore } from "../schema.ts";
import { fallbackReportFromText, parsePhishReport } from "./parse-result.ts";

test("parsePhishReport reads fenced JSON", () => {
  const text = `Summary here.

\`\`\`json
{
  "label": "High Risk",
  "score": 88,
  "summary": "Scam fee demand",
  "red_flags": [{ "type": "urgency", "snippet": "today", "why": "pressure", "severity": "high" }],
  "evidence": [{ "source": "email", "detail": "from free domain" }],
  "safe_next_action": "Verify on ERP",
  "what_not_to_do": ["Do not pay"]
}
\`\`\`
`;
  const r = parsePhishReport(text);
  assert.ok(r);
  assert.equal(r!.label, "High Risk");
  assert.equal(r!.score, 88);
  assert.equal(r!.red_flags.length, 1);
});

test("parsePhishReport aligns conflicting label/score cautiously", () => {
  const text = `\`\`\`json
{ "label": "High Risk", "score": 20, "summary": "x", "red_flags": [], "evidence": [], "safe_next_action": "wait", "what_not_to_do": [] }
\`\`\``;
  const r = parsePhishReport(text);
  assert.ok(r);
  assert.equal(r!.label, "High Risk");
  assert.ok(r!.score >= 70);
});

test("alignLabelAndScore prefers higher risk", () => {
  const a = alignLabelAndScore("Safe", 80);
  assert.equal(a.label, "High Risk");
  const b = alignLabelAndScore("High Risk", 10);
  assert.equal(b.label, "High Risk");
  assert.ok(b.score >= 70);
});

test("fallbackReportFromText detects high risk wording", () => {
  const r = fallbackReportFromText("This is clearly high risk phishing.");
  assert.equal(r.label, "High Risk");
});

test("parsePhishReport returns null for empty", () => {
  assert.equal(parsePhishReport(""), null);
});
