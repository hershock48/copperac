import { createHash } from "node:crypto";

export type Attempt = { id: string; fingerprint: string | null; createdAt: number; outcome: "accepted" | "rejected" | "cancelled"; status: number; response: Record<string, unknown> };
export type AttemptResult = { attempt: Attempt; created: boolean };
type OrderData = { id: string; number: number; status: string; createdAt: number; guestEmail: string };
type JobData = { id: string; printerId: string; orderId: string; body: string; status: string; createdAt: number };
type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export const ATTEMPT_SCHEMA = `
CREATE TABLE IF NOT EXISTS ordering_attempts (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS ordering_confirmations (order_id text PRIMARY KEY REFERENCES ordering_orders(id), status text NOT NULL, created_at bigint NOT NULL, data jsonb NOT NULL);
`;
export const isAttemptId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);

/** Bound bytes before JSON parsing; nested input is bounded again while fingerprinting. */
export async function readAttemptBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.byteLength; if (length > 65536) { await reader.cancel(); return null; } chunks.push(next.value); }
    const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  } catch { return null; } finally { reader.releaseLock(); }
}
export function requestFingerprint(body: Record<string, unknown>): string {
  const stable = (value: unknown, depth: number): unknown => {
    if (depth > 16) throw Error("Request nesting is too deep.");
    if (Array.isArray(value)) return value.map(v => stable(v, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, stable(v, depth + 1)]));
    return value;
  };
  return createHash("sha256").update(JSON.stringify(stable(body, 0))).digest("hex");
}
export function validateSettlement(attempt: Attempt, order?: OrderData, jobs: JobData[] = []): void {
  if (!isAttemptId(attempt.id) || !Number.isSafeInteger(attempt.createdAt) || attempt.createdAt < 0 || !["accepted", "rejected", "cancelled"].includes(attempt.outcome) || attempt.response.attemptId !== attempt.id || attempt.response.outcome !== attempt.outcome) throw Error("Invalid attempt record.");
  if (attempt.outcome === "cancelled" ? attempt.fingerprint !== null : typeof attempt.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(attempt.fingerprint)) throw Error("Invalid attempt fingerprint.");
  if (attempt.outcome === "accepted") {
    if (!order || order.id !== attempt.id || order.status !== "new" || !Number.isSafeInteger(order.number) || order.number < 1 || order.createdAt !== attempt.createdAt || attempt.status !== 200 || typeof order.guestEmail !== "string") throw Error("Invalid accepted order.");
  } else if (order || jobs.length || ![400,409,503].includes(attempt.status)) throw Error("A rejected attempt cannot create an order.");
  const printers = new Set<string>(), ids = new Set<string>();
  for (const job of jobs) {
    if (!order || !isAttemptId(job.id) || ids.has(job.id) || !job.printerId || printers.has(job.printerId) || job.orderId !== order.id || typeof job.body !== "string" || job.body.length > 100000 || job.status !== "queued" || job.createdAt !== order.createdAt) throw Error("Invalid print intent.");
    ids.add(job.id); printers.add(job.printerId);
  }
}
/** One PostgreSQL statement wins the key and writes the order, prints and email intent together. */
export async function settlePostgres(query: Query, attempt: Attempt, order?: OrderData, jobs: JobData[] = []): Promise<AttemptResult> {
  validateSettlement(attempt, order, jobs);
  const result = await query(`WITH won AS (
    INSERT INTO ordering_attempts(id,data) VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING RETURNING data
  ), placed AS (
    INSERT INTO ordering_orders(id,status,created_at,data)
    SELECT $1,$3::jsonb->>'status',($3::jsonb->>'createdAt')::bigint,$3::jsonb FROM won WHERE $3::jsonb IS NOT NULL RETURNING id,data
  ), prints AS (
    INSERT INTO ordering_print_jobs(id,printer_id,order_id,body,status,created_at)
    SELECT j->>'id',j->>'printerId',p.id,j->>'body','queued',(j->>'createdAt')::bigint FROM placed p CROSS JOIN jsonb_array_elements($4::jsonb) j RETURNING id
  ), confirmation AS (
    INSERT INTO ordering_confirmations(order_id,status,created_at,data)
    SELECT id,'queued',(data->>'createdAt')::bigint,data FROM placed WHERE data->>'guestEmail' <> '' RETURNING order_id
  ) SELECT data FROM won`, [attempt.id, JSON.stringify(attempt), order ? JSON.stringify(order) : null, JSON.stringify(jobs)]);
  if (result.rows[0]) return { attempt: result.rows[0].data as Attempt, created: true };
  // ON CONFLICT can wait for a winner outside the statement snapshot. A new
  // statement then sees that committed row under PostgreSQL READ COMMITTED.
  const existing = await query("SELECT data FROM ordering_attempts WHERE id=$1", [attempt.id]);
  if (!existing.rows[0]) throw Error("The submission result could not be confirmed.");
  return { attempt: existing.rows[0].data as Attempt, created: false };
}

export function settleMemory<T extends OrderData, J extends JobData>(bag: { attempts: Map<string, Attempt>; orders: Map<string, T>; printJobs: J[]; confirmations: Map<string, { status: string; order: T }> }, attempt: Attempt, order?: T, jobs: J[] = []): AttemptResult {
  validateSettlement(attempt, order, jobs);
  const existing = bag.attempts.get(attempt.id); if (existing) return { attempt: structuredClone(existing), created: false };
  // Stage every fallible clone before touching any collection.
  const copy = structuredClone({ attempt, order, jobs });
  bag.attempts.set(attempt.id, copy.attempt);
  if (copy.order) {
    bag.orders.set(copy.order.id, copy.order); bag.printJobs.push(...copy.jobs);
    if (copy.order.guestEmail) bag.confirmations.set(copy.order.id, { status: "queued", order: copy.order });
  }
  return { attempt: structuredClone(copy.attempt), created: true };
}
