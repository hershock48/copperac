import { createHash, randomUUID } from "node:crypto";

export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
export type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
export type PrinterPoll = { statusCode: string; printingInProgress: boolean; jobToken: string | null };
export type PrintJob = { id: string; printerId: string; orderId: string; body: string; status: string; createdAt: number; fetchedAt: number | null; settledAt: number | null; resultCode: string | null };
export type PrintReply = { status: number; job?: PrintJob; duplicate?: boolean; error?: string };
export const PRINT_TTL_MS = 20 * 60 * 1000;
export const PRINT_SCHEMA = `ALTER TABLE ordering_print_jobs ADD COLUMN IF NOT EXISTS fetched_at bigint;
ALTER TABLE ordering_print_jobs ADD COLUMN IF NOT EXISTS settled_at bigint;
ALTER TABLE ordering_print_jobs ADD COLUMN IF NOT EXISTS result_code text;
ALTER TABLE ordering_printers ADD COLUMN IF NOT EXISTS reported_status text;
ALTER TABLE ordering_printers ADD COLUMN IF NOT EXISTS reported_job text;
ALTER TABLE ordering_printers ADD COLUMN IF NOT EXISTS printing_in_progress boolean;
CREATE UNIQUE INDEX IF NOT EXISTS ordering_one_fetched_per_printer ON ordering_print_jobs(printer_id) WHERE status='fetched';
CREATE TABLE IF NOT EXISTS ordering_print_history(id text PRIMARY KEY,printer_id text NOT NULL,job_id text NOT NULL,created_at bigint NOT NULL,data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS ordering_print_history_job ON ordering_print_history(job_id,created_at);
CREATE TABLE IF NOT EXISTS ordering_print_actions(id text PRIMARY KEY,fingerprint text NOT NULL,data jsonb NOT NULL);`;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const isPrintId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
export function printerCode(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 240) return null;
  let value: string;
  try { value = decodeURIComponent(raw.replace(/\+/g, "%20")).trim(); } catch { return null; }
  if (value === "OK") return "200 OK";
  return /^\d{3,4}(?: [^\x00-\x1f\x7f]{1,160})?$/.test(value) ? value : null;
}
export function parsePrinterPoll(raw: unknown): PrinterPoll | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>, code = printerCode(v.statusCode);
  if (!code || (v.printingInProgress != null && typeof v.printingInProgress !== "boolean") || (v.jobToken != null && !isPrintId(v.jobToken))) return null;
  return { statusCode: code, printingInProgress: v.printingInProgress === true || /^22\d(?: |$)/.test(code), jobToken: typeof v.jobToken === "string" ? v.jobToken : null };
}
function job(row: Record<string, unknown>): PrintJob {
  return { id: String(row.id), printerId: String(row.printer_id), orderId: String(row.order_id), body: String(row.body), status: String(row.status), createdAt: Number(row.created_at), fetchedAt: row.fetched_at == null ? null : Number(row.fetched_at), settledAt: row.settled_at == null ? null : Number(row.settled_at), resultCode: row.result_code == null ? null : String(row.result_code) };
}
async function getJob(q: Query, printerId: string, id: string): Promise<PrintJob | null> {
  const r = await q("SELECT * FROM ordering_print_jobs WHERE printer_id=$1 AND id=$2", [printerId, id]);
  return r.rows[0] ? job(r.rows[0]) : null;
}
async function active(q: Query, printerId: string): Promise<PrintJob | null> {
  const r = await q("SELECT * FROM ordering_print_jobs WHERE printer_id=$1 AND status IN ('queued','fetched') ORDER BY (status='fetched') DESC,created_at,id LIMIT 1", [printerId]);
  return r.rows[0] ? job(r.rows[0]) : null;
}
async function withPrinter<T>(transaction: Transaction, printerId: string, work: (q: Query) => Promise<T>): Promise<T> {
  if (!printerId || printerId.length > 80) throw Error("Invalid printer id.");
  return transaction(async q => {
    await q("INSERT INTO ordering_printers(id,last_seen) VALUES($1,0) ON CONFLICT(id) DO NOTHING", [printerId]);
    // Serialize each physical device. Each subsequent statement sees committed
    // state under PostgreSQL READ COMMITTED, including after a lock wait.
    await q("SELECT id FROM ordering_printers WHERE id=$1 FOR UPDATE", [printerId]);
    return work(q);
  });
}
async function history(q: Query, printerId: string, id: string, event: string, before: unknown, after: unknown, now: number, extra = {}) {
  await q("INSERT INTO ordering_print_history(id,printer_id,job_id,created_at,data) VALUES($1,$2,$3,$4,$5::jsonb)", [randomUUID(), printerId, id, now, JSON.stringify({ event, actor: "printer", before, after, ...extra })]);
}
async function expireQueued(q: Query, printerId: string, now: number) {
  const changed = await q("UPDATE ordering_print_jobs SET status='expired',settled_at=$2,result_code='NOT_FETCHED_BEFORE_DEADLINE' WHERE printer_id=$1 AND status='queued' AND created_at < $3 RETURNING *", [printerId, now, now - PRINT_TTL_MS]);
  for (const raw of changed.rows) {
    const after = job(raw);
    await history(q, printerId, after.id, "expired", { ...after, status: "queued", settledAt: null, resultCode: null }, after, now);
  }
}
export function pollPrintJob(transaction: Transaction, printerId: string, poll: PrinterPoll, now = Date.now()): Promise<PrintJob | null> {
  return withPrinter(transaction, printerId, async q => {
    await q("UPDATE ordering_printers SET last_seen=$2,reported_status=$3,reported_job=$4,printing_in_progress=$5 WHERE id=$1", [printerId, now, poll.statusCode, poll.jobToken, poll.printingInProgress]);
    await expireQueued(q, printerId, now);
    if (poll.printingInProgress || !/^2\d{2}(?: |$)/.test(poll.statusCode)) return null;
    const next = await active(q, printerId);
    if (!next) return null;
    // A lost token after a fetch is uncertain, not proof of printing. Hold this
    // device's next ticket until a correlated result or an owner review.
    if (next.status === "fetched" && poll.jobToken !== next.id) return null;
    if (poll.jobToken && poll.jobToken !== next.id) {
      const previous = await getJob(q, printerId, poll.jobToken);
      if (!previous || ["queued", "fetched"].includes(previous.status)) return null;
    }
    return next;
  });
}
export function fetchPrintJob(transaction: Transaction, printerId: string, id: string, now = Date.now()): Promise<PrintReply> {
  if (!isPrintId(id)) return Promise.resolve({ status: 400, error: "A job token is required." });
  return withPrinter(transaction, printerId, async q => {
    const initial = await getJob(q, printerId, id);
    if (!initial) return { status: 404 };
    // Order -> job lock order matches cancellation, which locks the order before
    // suppressing queued jobs. Device operations additionally hold the device row.
    const orders = await q("SELECT data FROM ordering_orders WHERE id=$1 FOR UPDATE", [initial.orderId]);
    const current = await getJob(q, printerId, id);
    if (!current || !["queued", "fetched"].includes(current.status)) return { status: 410 };
    const order = orders.rows[0]?.data as { status?: string } | undefined;
    if (!order || !["new", "accepted"].includes(order.status ?? "")) return { status: 410, error: "The order is no longer open." };
    if (current.status === "queued" && current.createdAt < now - PRINT_TTL_MS) {
      await expireQueued(q, printerId, now); return { status: 410 };
    }
    if ((await active(q, printerId))?.id !== id) return { status: 409, error: "Another ticket is ahead of this job." };
    if (current.status === "fetched") return { status: 200, job: current, duplicate: true };
    const result = await q("UPDATE ordering_print_jobs SET status='fetched',fetched_at=$3 WHERE printer_id=$1 AND id=$2 AND status='queued' RETURNING *", [printerId, id, now]);
    if (!result.rows[0]) return { status: 409 };
    const after = job(result.rows[0]);
    await history(q, printerId, id, "fetched", current, after, now);
    return { status: 200, job: after };
  });
}
export function confirmPrintJob(transaction: Transaction, printerId: string, id: string, role: "kitchen" | "front", code: string, now = Date.now()): Promise<PrintReply> {
  const normalized = printerCode(code);
  if (!isPrintId(id) || !normalized) return Promise.resolve({ status: 400, error: "A job token and explicit result code are required." });
  const success = /^2\d{2}(?: |$)/.test(normalized);
  return withPrinter(transaction, printerId, async q => {
    const initial = await getJob(q, printerId, id);
    if (!initial) return { status: 404 };
    const orders = await q("SELECT data FROM ordering_orders WHERE id=$1 FOR UPDATE", [initial.orderId]);
    const current = await getJob(q, printerId, id);
    if (!current) return { status: 404 };
    if (["printed", "failed"].includes(current.status) && current.resultCode) {
      return current.status === (success ? "printed" : "failed") ? { status: 200, duplicate: true } : { status: 409, error: "This ticket already has a different result. Owner review is required." };
    }
    if (!["queued", "fetched"].includes(current.status)) return { status: 410 };
    if (success && current.fetchedAt === null) return { status: 409, error: "This ticket was not fetched." };
    if (current.status === "queued" && (await active(q, printerId))?.id !== id) return { status: 409 };
    const result = await q("UPDATE ordering_print_jobs SET status=$3,settled_at=$4,result_code=$5 WHERE printer_id=$1 AND id=$2 AND status=$6 RETURNING *", [printerId, id, success ? "printed" : "failed", now, normalized, current.status]);
    if (!result.rows[0]) return { status: 409 };
    const beforeOrder = orders.rows[0]?.data as Record<string, unknown> | undefined;
    let afterOrder = beforeOrder;
    if (success && role === "kitchen" && beforeOrder?.status === "new") {
      afterOrder = { ...beforeOrder, status: "accepted", acceptedAt: now, lastOperationId: id };
      await q("UPDATE ordering_orders SET status='accepted',data=$2::jsonb WHERE id=$1", [current.orderId, JSON.stringify(afterOrder)]);
    }
    const after = job(result.rows[0]);
    await history(q, printerId, id, success ? "confirmed" : "failed", current, after, now, { orderBefore: beforeOrder ?? null, orderAfter: afterOrder ?? null, role });
    return { status: 200, job: after };
  });
}
export type PrintIssue = { id: string; printerId: string; orderId: string; orderNumber: number | null; status: string; createdAt: number; fetchedAt: number | null; resultCode: string | null; revision: string };
export function printRevision(value: PrintJob): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export async function printStatus(query: Query): Promise<{ devices: { id: string; lastSeen: number; reportedStatus: string | null }[]; issues: PrintIssue[]; issueCount: number }> {
  const devices = await query("SELECT id,last_seen,reported_status FROM ordering_printers");
  const issues = await query("SELECT p.*,o.data->>'number' AS order_number,COUNT(*) OVER() AS issue_count FROM ordering_print_jobs p LEFT JOIN ordering_orders o ON o.id=p.order_id WHERE p.status IN ('fetched','failed','expired') ORDER BY (p.status='fetched') DESC,p.created_at,p.id LIMIT 20");
  return { devices: devices.rows.map(r => ({ id: String(r.id), lastSeen: Number(r.last_seen), reportedStatus: r.reported_status == null ? null : String(r.reported_status) })), issues: issues.rows.map(r => {
    const value = job(r);
    return { id:value.id,printerId:value.printerId,orderId:value.orderId,orderNumber:r.order_number == null ? null : Number(r.order_number),status:value.status,createdAt:value.createdAt,fetchedAt:value.fetchedAt,resultCode:value.resultCode,revision:printRevision(value) };
  }), issueCount: Number(issues.rows[0]?.issue_count ?? 0) };
}

export type PrintCommand = { operationId: string; printerId: string; jobId: string; revision: string; mode: "confirm_printed" | "reprint" | "skip"; reason: string };
export type PrintAction = { operationId: string; command: PrintCommand; outcome: "saved" | "rejected"; httpStatus: number; message: string; createdAt: number; replacementId?: string };
export function parsePrintCommand(raw: unknown): PrintCommand | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).sort().join(",")!=="jobId,mode,operationId,printerId,reason,revision" || !isPrintId(v.operationId) || !isPrintId(v.jobId) || typeof v.printerId!=="string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.printerId) || typeof v.revision!=="string" || !/^[a-f0-9]{64}$/.test(v.revision) || !["confirm_printed","reprint","skip"].includes(String(v.mode)) || typeof v.reason!=="string" || !v.reason.trim() || v.reason.length>240 || /[\x00-\x1f\x7f]/.test(v.reason)) return null;
  return { operationId:v.operationId,printerId:v.printerId,jobId:v.jobId,revision:v.revision,mode:v.mode as PrintCommand["mode"],reason:v.reason };
}
export async function getPrintAction(q: Query, id: string): Promise<PrintAction | null> {
  const result=await q("SELECT data FROM ordering_print_actions WHERE id=$1",[id]);
  return (result.rows[0]?.data as PrintAction | undefined) ?? null;
}
export function resolvePrintJob(transaction: Transaction, command: PrintCommand, role: "kitchen" | "front", now=Date.now()): Promise<PrintAction> {
  const parsed=parsePrintCommand(command);
  if(!parsed) return Promise.reject(Error("Invalid printer review."));
  const fingerprint=createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  return withPrinter(transaction,command.printerId,async q=>{
    const reserve=await q("INSERT INTO ordering_print_actions(id,fingerprint,data) VALUES($1,$2,'{}'::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id",[command.operationId,fingerprint]);
    if(!reserve.rows.length){
      const existing=await q("SELECT fingerprint,data FROM ordering_print_actions WHERE id=$1",[command.operationId]);
      if(existing.rows[0]?.fingerprint===fingerprint) return existing.rows[0].data as PrintAction;
      return {operationId:command.operationId,command,outcome:"rejected",httpStatus:409,message:"This action reference belongs to a different review.",createdAt:now};
    }
    const finish=async(outcome:PrintAction["outcome"],httpStatus:number,message:string,replacementId?:string)=>{
      const result:PrintAction={operationId:command.operationId,command,outcome,httpStatus,message,createdAt:now,...(replacementId?{replacementId}:{})};
      await q("UPDATE ordering_print_actions SET data=$2::jsonb WHERE id=$1",[command.operationId,JSON.stringify(result)]);
      return result;
    };
    const initial=await getJob(q,command.printerId,command.jobId);
    if(!initial) return finish("rejected",404,"This printer ticket was not found.");
    const orders=await q("SELECT data FROM ordering_orders WHERE id=$1 FOR UPDATE",[initial.orderId]);
    const current=await getJob(q,command.printerId,command.jobId);
    if(!current || printRevision(current)!==command.revision || !["fetched","failed","expired"].includes(current.status)) return finish("rejected",409,"This ticket changed. Refresh and review its current result.");
    const beforeOrder=orders.rows[0]?.data as Record<string,unknown>|undefined;
    if(command.mode==="reprint" && !["new","accepted"].includes(String(beforeOrder?.status))) return finish("rejected",409,"A replacement is only available for an open order.");
    let afterOrder=beforeOrder;
    const status=command.mode==="confirm_printed"?"printed":command.mode==="reprint"?"superseded":"dismissed";
    const changed=await q("UPDATE ordering_print_jobs SET status=$3,settled_at=$4,result_code=$5 WHERE printer_id=$1 AND id=$2 RETURNING *",[command.printerId,command.jobId,status,now,"OWNER_"+command.mode.toUpperCase()]);
    let replacementId:string|undefined;
    if(command.mode==="reprint"){
      replacementId=randomUUID();
      await q("INSERT INTO ordering_print_jobs(id,printer_id,order_id,body,status,created_at) VALUES($1,$2,$3,$4,'queued',$5)",[replacementId,command.printerId,current.orderId,"*** REPLACEMENT: CHECK FOR DUPLICATE ***\n"+current.body,now]);
    }else if(command.mode==="confirm_printed" && role==="kitchen" && beforeOrder?.status==="new"){
      afterOrder={...beforeOrder,status:"accepted",acceptedAt:now,lastOperationId:command.operationId};
      await q("UPDATE ordering_orders SET status='accepted',data=$2::jsonb WHERE id=$1",[current.orderId,JSON.stringify(afterOrder)]);
    }
    await history(q,command.printerId,command.jobId,"owner_review",current,job(changed.rows[0]),now,{actor:"owner",command,role,orderBefore:beforeOrder??null,orderAfter:afterOrder??null,replacementId:replacementId??null});
    return finish("saved",200,command.mode==="reprint"?"Replacement queued. Check printer status for its result.":command.mode==="confirm_printed"?"Your physical print check was recorded.":"Ticket closed. Handle the order on screen.",replacementId);
  });
}
