/** Shared request limits and simple in-memory rate limiting. */

export const MAX_EMAIL_CHARS = 100_000;
export const AGENT_TIMEOUT_MS = 180_000; // 3 minutes
export const MAX_CONCURRENT_ANALYZE = 2;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_ANALYZE = 8; // per IP per window

export class RateLimiter {
  private hits = new Map<string, number[]>();

  /** Returns true if the key is allowed; records the hit when allowed. */
  allow(key: string, max: number = RATE_LIMIT_MAX_ANALYZE, windowMs: number = RATE_LIMIT_WINDOW_MS): boolean {
    const now = Date.now();
    const prev = this.hits.get(key) ?? [];
    const recent = prev.filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  retryAfterSec(key: string, max: number = RATE_LIMIT_MAX_ANALYZE, windowMs: number = RATE_LIMIT_WINDOW_MS): number {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length < max) return 0;
    const oldest = Math.min(...recent);
    return Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
  }
}

export class ConcurrencyGate {
  private active = 0;

  constructor(private readonly max: number = MAX_CONCURRENT_ANALYZE) {}

  tryAcquire(): boolean {
    if (this.active >= this.max) return false;
    this.active++;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }

  get running(): number {
    return this.active;
  }
}

export function clientKey(c: { req: { header: (name: string) => string | undefined } }): string {
  const xf = c.req.header("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return c.req.header("x-real-ip") || "local";
}

export function validateEmailBody(email: unknown): { ok: true; email: string } | { ok: false; error: string; status: 400 } {
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, error: "email is required", status: 400 };
  }
  if (email.length > MAX_EMAIL_CHARS) {
    return {
      ok: false,
      error: `email exceeds maximum length of ${MAX_EMAIL_CHARS.toLocaleString()} characters`,
      status: 400,
    };
  }
  return { ok: true, email };
}
