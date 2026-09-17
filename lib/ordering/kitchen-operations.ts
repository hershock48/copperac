import { createHash } from "node:crypto";

export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type Actor = "staff" | "owner" | "printer";
export type Board = { unavailable: string[]; busyMinutes: 0 | 15 | 30; pausedUntil: number | null; lastOperationId?: string };
export type BoardView = Board & { revision: string };
export type OrderRecord = { id: string; status: string; acceptedAt: number | null; paid: boolean; [key: string]: unknown };
export type Command = { operationId: string; kind: "state" | "order"; revision: string; change?: { itemId: string; unavailable: boolean } | { busyMinutes: number } | { pauseMinutes: number }; orderId?: string; status?: "accepted" | "done" | "cancelled"; reason?: string };
export type Receipt = { id: string; fingerprint: string; kind: string; actor: Actor; createdAt: number; httpStatus: number; response: Record<string, unknown>; before: unknown; after: unknown };
export type Candidate = { table: "ordering_state" | "ordering_orders"; key: string | number; before: unknown; after: Record<string, unknown> };
export const OPERATION_SCHEMA = `CREATE TABLE IF NOT EXISTS ordering_operations (id text PRIMARY KEY, kind text NOT NULL, created_at bigint NOT NULL, data jsonb NOT NULL); CREATE INDEX IF NOT EXISTS ordering_operations_date ON ordering_operations(created_at);`;
export const EMPTY_BOARD: Board = { unavailable: [], busyMinutes: 0, pausedUntil: null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isOperationId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function canonical(v: unknown, depth = 0): string {
  if (depth > 16) throw Error("Nested request is too deep.");
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(x => canonical(x, depth + 1)).join(",") + "]";
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k], depth + 1)).join(",") + "}";
}
export const revisionOf = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
export function boardView(raw: unknown, now = Date.now()): BoardView {
  const state = raw === null ? EMPTY_BOARD : raw;
  if (!object(state) || !Array.isArray(state.unavailable) || state.unavailable.some(x => typeof x !== "string") || ![0,15,30].includes(state.busyMinutes as number) || !(state.pausedUntil === null || Number.isSafeInteger(state.pausedUntil))) throw Error("Invalid saved kitchen state.");
  return { unavailable: [...state.unavailable] as string[], busyMinutes: state.busyMinutes as Board["busyMinutes"], pausedUntil: state.pausedUntil !== null && Number(state.pausedUntil) > now ? Number(state.pausedUntil) : null, revision: revisionOf(raw) };
}
export function orderView<T extends { id: string; status: string }>(raw: T): T & { revision: string } { return { ...structuredClone(raw), revision: revisionOf(raw) }; }

export function parseCommand(raw: unknown, kind: Command["kind"]): Command | null {
  if (!object(raw) || raw.kind !== kind || !isOperationId(raw.operationId) || typeof raw.revision !== "string" || !/^[a-f0-9]{64}$/.test(raw.revision)) return null;
  const allowed = kind === "state" ? ["operationId","kind","revision","change"] : ["operationId","kind","revision","orderId","status","reason"];
  if (Object.keys(raw).some(key => !allowed.includes(key))) return null;
  if (kind === "state") {
    const c = raw.change; if (!object(c)) return null;
    const keys = Object.keys(c).sort().join(",");
    if (keys === "itemId,unavailable") {
      if (typeof c.itemId !== "string" || !c.itemId || c.itemId.length > 200 || typeof c.unavailable !== "boolean") return null;
    } else if (keys === "busyMinutes") { if (![0,15,30].includes(c.busyMinutes as number)) return null; }
    else if (keys === "pauseMinutes") { if (![0,30,60,90].includes(c.pauseMinutes as number)) return null; }
    else return null;
  } else {
    if (!isOperationId(raw.orderId) || !["accepted","done","cancelled"].includes(raw.status as string)) return null;
    if (raw.status === "cancelled") { if (typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 240) return null; }
    else if (raw.reason !== undefined) return null;
  }
  return structuredClone(raw) as Command;
}
export function rejected(id: string, fingerprint: string, kind: string, actor: Actor, error: string, httpStatus = 400, now = Date.now()): Receipt {
  return { id, fingerprint, kind, actor, createdAt: now, httpStatus, response: { operationId: id, kind, outcome: "rejected", error }, before: null, after: null };
}
export function prepare(command: Command, raw: unknown, actor: Actor, fingerprint: string, now = Date.now()): { receipt: Receipt; candidate: Candidate | null } {
  const deny = (error: string, status = 409) => ({ receipt: rejected(command.operationId, fingerprint, command.kind, actor, error, status, now), candidate: null });
  if (command.kind === "order" && command.status === "cancelled" && actor !== "owner") return deny("Owner sign-in is required to cancel an order.", 403);
  if (command.kind === "state" && actor === "printer") return deny("A printer cannot change kitchen controls.", 403);
  if (revisionOf(raw) !== command.revision) return deny("The saved record changed. Refresh the board and review this action again.");
  let after: Record<string, unknown>, response: Record<string, unknown>, key: string | number;
  if (command.kind === "state") {
    const view = boardView(raw, now), c = command.change!;
    after = { unavailable: view.unavailable, busyMinutes: view.busyMinutes, pausedUntil: view.pausedUntil, lastOperationId: command.operationId };
    if ("itemId" in c) after.unavailable = c.unavailable ? [...new Set([...view.unavailable,c.itemId])] : view.unavailable.filter(id => id !== c.itemId);
    else if ("busyMinutes" in c) after.busyMinutes = c.busyMinutes;
    else after.pausedUntil = c.pauseMinutes === 0 ? null : now + c.pauseMinutes * 60000;
    key = 1; response = { state: boardView(after, now) };
  } else {
    if (!object(raw) || raw.id !== command.orderId) return deny("No such order.", 404);
    const status = command.status!;
    if (actor === "printer" && status !== "accepted") return deny("A printer can only acknowledge a new order.", 403);
    const legal = status === "accepted" ? raw.status === "new" : status === "done" ? raw.status === "accepted" : raw.status === "new" || raw.status === "accepted";
    if (!legal) return deny("That order has already moved on. Refresh the board before changing it.");
    after = { ...raw, status, lastOperationId: command.operationId };
    if (status === "accepted") after.acceptedAt = now;
    if (status === "done") after.completedAt = now;
    if (status === "cancelled") { after.cancelledAt = now; after.cancellationReason = command.reason!.trim(); }
    key = command.orderId!; response = { order: orderView(after as OrderRecord) };
  }
  const receipt: Receipt = { id: command.operationId, fingerprint, kind: command.kind, actor, createdAt: now, httpStatus: 200, response: { operationId: command.operationId, kind: command.kind, outcome: "applied", ...response }, before: structuredClone(raw), after: structuredClone(after) };
  return { receipt, candidate: { table: command.kind === "state" ? "ordering_state" : "ordering_orders", key, before: raw, after } };
}
export async function getReceipt(query: Query, id: string): Promise<Receipt | null> {
  const result = await query("SELECT data FROM ordering_operations WHERE id=$1", [id]);
  return result.rows[0]?.data as Receipt ?? null;
}
export function replay(receipt: Receipt, fingerprint: string): Receipt {
  return receipt.fingerprint === fingerprint ? structuredClone(receipt) : rejected(receipt.id, fingerprint, receipt.kind, receipt.actor, "This action reference was already used for a different request. Refresh and review the action.", 409, receipt.createdAt);
}
/** Mutation, receipt and before/after history are one statement. A unique receipt
 * collision rolls back every change, including a concurrent changed-body request. */
export async function commitOperation(query: Query, receipt: Receipt, candidate: Candidate | null): Promise<Receipt> {
  if (!isOperationId(receipt.id) || !/^[a-f0-9]{64}$/.test(receipt.fingerprint)) throw Error("Invalid operation receipt.");
  const prior = await getReceipt(query, receipt.id); if (prior) return replay(prior, receipt.fingerprint);
  const params: unknown[] = [receipt.id,receipt.kind,receipt.createdAt,JSON.stringify(receipt)];
  let sql = "INSERT INTO ordering_operations(id,kind,created_at,data) VALUES($1,$2,$3,$4::jsonb) RETURNING data";
  if (candidate) {
    const conflict = rejected(receipt.id,receipt.fingerprint,receipt.kind,receipt.actor,"The saved record changed. Refresh the board and review this action again.",409,receipt.createdAt);
    params.push(candidate.key,JSON.stringify(candidate.after),JSON.stringify(candidate.before),JSON.stringify(conflict));
    let change: string;
    if (candidate.table === "ordering_state") {
      change = candidate.before === null
        ? "INSERT INTO ordering_state(id,data) SELECT $5::int,$6::jsonb WHERE $7::jsonb='null'::jsonb ON CONFLICT(id) DO NOTHING RETURNING data"
        : "UPDATE ordering_state SET data=$6::jsonb WHERE id=$5::int AND data=$7::jsonb RETURNING data";
    } else if (candidate.table === "ordering_orders") {
      change = "UPDATE ordering_orders SET data=$6::jsonb,status=$6::jsonb->>'status' WHERE id=$5::text AND data=$7::jsonb RETURNING data";
    } else throw Error("Unsupported operation target.");
    sql = `WITH changed AS (${change}), cancelled_prints AS (
      UPDATE ordering_print_jobs SET status='failed' WHERE order_id=$5::text AND status='queued'
      AND $2='order' AND EXISTS(SELECT 1 FROM changed WHERE data->>'status'='cancelled') RETURNING id
    ) INSERT INTO ordering_operations(id,kind,created_at,data)
      SELECT $1,$2,$3,CASE WHEN EXISTS(SELECT 1 FROM changed) THEN $4::jsonb ELSE $8::jsonb END RETURNING data`;
  }
  try { const result = await query(sql, params); return result.rows[0].data as Receipt; }
  catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
    const existing = await getReceipt(query,receipt.id); if (!existing) throw error;
    return replay(existing,receipt.fingerprint);
  }
}
export function commitMemory(operations: Map<string,Receipt>, current: unknown, receipt: Receipt, candidate: Candidate | null): { receipt: Receipt; value: unknown; changed: boolean } {
  const prior=operations.get(receipt.id); if(prior)return { receipt:replay(prior,receipt.fingerprint),value:current,changed:false };
  let result=receipt,changed=Boolean(candidate);
  if(candidate && revisionOf(current)!==revisionOf(candidate.before)) { result=rejected(receipt.id,receipt.fingerprint,receipt.kind,receipt.actor,"The saved record changed. Refresh the board and review this action again.",409,receipt.createdAt); changed=false; }
  const value=structuredClone(changed?candidate!.after:current),saved=structuredClone(result);
  operations.set(receipt.id,saved);return { receipt:structuredClone(saved),value,changed };
}
