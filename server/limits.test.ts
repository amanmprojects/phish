import assert from "node:assert/strict";
import { test } from "node:test";
import { ConcurrencyGate, RateLimiter, validateEmailBody, MAX_EMAIL_CHARS } from "./limits.ts";

test("validateEmailBody rejects empty and oversized", () => {
  assert.equal(validateEmailBody("").ok, false);
  assert.equal(validateEmailBody("  ").ok, false);
  assert.equal(validateEmailBody("hi").ok, true);
  const big = "x".repeat(MAX_EMAIL_CHARS + 1);
  assert.equal(validateEmailBody(big).ok, false);
});

test("RateLimiter blocks after max", () => {
  const rl = new RateLimiter();
  for (let i = 0; i < 8; i++) assert.equal(rl.allow("ip1", 8, 60_000), true);
  assert.equal(rl.allow("ip1", 8, 60_000), false);
  assert.equal(rl.allow("ip2", 8, 60_000), true);
});

test("ConcurrencyGate tracks slots", () => {
  const g = new ConcurrencyGate(2);
  assert.equal(g.tryAcquire(), true);
  assert.equal(g.tryAcquire(), true);
  assert.equal(g.tryAcquire(), false);
  g.release();
  assert.equal(g.tryAcquire(), true);
});
