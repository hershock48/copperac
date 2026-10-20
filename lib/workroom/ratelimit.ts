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

  // A bucket with nothing in its window is deleted, not written back: a scan
  // from many addresses used to leave one empty entry per address for the
  // life of the process.
  const prune = (key: string) => {
    const now = Date.now();
    const b = buckets.get(key) ?? { failures: [] };
    b.failures = b.failures.filter((t) => now - t < opts.windowMs);
    if (b.failures.length === 0) buckets.delete(key);
    else buckets.set(key, b);
    return b;
  };

  return {
    allowed(key: string): boolean {
      return prune(key).failures.length < opts.max;
    },
    /** Seconds until the oldest failure in the window ages out, which is when a try is allowed again. */
    retryAfterSec(key: string): number {
      const b = prune(key);
      const oldest = b.failures[0];
      if (oldest === undefined) return 0;
      return Math.max(1, Math.ceil((opts.windowMs - (Date.now() - oldest)) / 1000));
    },
    fail(key: string): void {
      // prune() hands back a bucket it may have just dropped from the map, so
      // the miss is written back by hand: the first version pushed into the
      // detached copy and the door never counted a single miss (caught by
      // the run-through's "five misses then 429", 20 Oct 2026).
      const b = prune(key);
      b.failures.push(Date.now());
      buckets.set(key, b);
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
