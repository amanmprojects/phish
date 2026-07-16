import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseEmail } from "./parse-email.ts";
import { quickCheck } from "./quick-check.ts";
import { labelRank } from "./schema.ts";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function checkFile(name: string) {
  const raw = readFileSync(join(fixturesDir, name), "utf8");
  return quickCheck(parseEmail(raw));
}

test("scholarship-scam is High Risk", () => {
  const r = checkFile("scholarship-scam.txt");
  assert.equal(r.label, "High Risk");
  assert.ok(r.score >= 70);
});

test("fake-placement is High Risk", () => {
  const r = checkFile("fake-placement.txt");
  assert.equal(r.label, "High Risk");
  assert.ok(r.score >= 70);
});

test("legit-fee-notice is Safe or low Suspicious", () => {
  const r = checkFile("legit-fee-notice.txt");
  assert.ok(labelRank(r.label) <= 1);
  assert.ok(r.score < 70);
  // Prefer Safe when discounts apply
  assert.ok(r.score < 50, `expected low score, got ${r.score}`);
});

test("prompt-injection fixture is High Risk (not Safe)", () => {
  const r = checkFile("prompt-injection.txt");
  assert.equal(r.label, "High Risk");
  assert.ok(r.score >= 70);
});

test("ambiguous-urgency is not Safe", () => {
  const r = checkFile("ambiguous-urgency.txt");
  assert.notEqual(r.label, "Safe");
});
