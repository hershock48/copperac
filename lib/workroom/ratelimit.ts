/**
 * A per-instance failure counter for the workroom door. Lifted from anchor's
 * lib/ratelimit.ts, whose header records the measurement that earned it: 30
 * unthrottled attempts landed in 43ms, so an ungated door is a sweep, not a
 * guess. Counters live in memory per instance, which on serverless means an
 * attacker spread across enough cold starts gets more tries than the number
 * suggests. Still worth having: it turns a fast sweep into something slow,
 * noisy and obvious.
 */

type Bucket = { failures: number[] };

export function limiter(name: string, opts: { windowMs: number; max: number }) {
  const g = globalThis as typeof globalThis & { __copperLimiters?: Map<string, Map<string, Bucket>> };
  if (!g.__copperLimiters) g.__copperLimiters = new Map();
  if (!g.__copperLimiters.has(name)) g.__copperLimiters.set(name, new Map());
  const buckets = g.__copperLimiters.get(name)!;

  const prune = (key: string) => {
    const now = Date.now();
    const b = buckets.get(key) ?? { failures: [] };
    b.failures = b.failures.filter((t) => now - t < opts.windowMs);
    buckets.set(key, b);
    return b;
  };

  return {
    allowed(key: string): boolean {
      return prune(key).failures.length < opts.max;
    },
    retryAfterSec(): number {
      return Math.ceil(opts.windowMs / 1000);
    },
    fail(key: string): void {
      prune(key).failures.push(Date.now());
    },
    clear(key: string): void {
      buckets.delete(key);
    },
  };
}

/** The caller's address, as the platform reports it. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || "unknown";
}
