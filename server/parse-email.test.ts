import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { cleanUrl, parseEmail, stripHtml } from "./parse-email.ts";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test("parseEmail extracts headers, urls, and from domain", () => {
  const raw = readFileSync(join(fixturesDir, "scholarship-scam.txt"), "utf8");
  const p = parseEmail(raw);
  assert.ok(p.from?.includes("university-grants-support.com"));
  assert.equal(p.fromDomain, "university-grants-support.com");
  assert.ok(p.subject?.toLowerCase().includes("scholarship"));
  assert.ok(p.urls.some((u) => u.includes("bit.ly")));
  assert.ok(p.amounts.some((a) => /500|₹/.test(a)));
});

test("parseEmail strips simple HTML and keeps link href", () => {
  const p = parseEmail(`<html><body><p>Pay now</p><a href="https://evil.example/pay">click</a></body></html>`);
  assert.ok(!p.body.includes("<p>"));
  assert.ok(p.urls.some((u) => u.includes("evil.example")));
});

test("stripHtml converts breaks", () => {
  assert.match(stripHtml("a<br>b"), /a\s*b/);
});

test("cleanUrl drops utm params", () => {
  const u = cleanUrl("https://example.com/x?utm_source=x&keep=1");
  assert.ok(u.includes("keep=1"));
  assert.ok(!u.includes("utm_source"));
});

test("parseEmail finds UPI ids", () => {
  const p = parseEmail("Send money to student@ybl right now");
  assert.ok(p.upiIds?.includes("student@ybl"));
});
