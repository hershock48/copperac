import { NOTIFICATION_SCHEMA, notificationList, dueNotifications, dueDeliveryChecks, dispatchNotification, checkNotification, closeNotification, getNotificationReview, type Mail, type SendResult, type DeliveryResult, type CloseCommand } from "./notification-outbox";
import { resolvePrintJob, getPrintAction, type PrintCommand, PRINT_SCHEMA, pollPrintJob, fetchPrintJob, confirmPrintJob, printStatus, type PrinterPoll, type PrintReply, type Query } from "./printer-jobs";
// Order and kitchen-state storage.
//
// Two backends behind one interface:
//
//   PostgresStore  when DATABASE_URL (or POSTGRES_URL) is set. One click in
//                  Vercel: project > Storage > Create Database > Neon, free
//                  tier. Tables create themselves on first use. This is the
//                  one the two-device demo needs: order placed on a phone,
//                  kitchen screen on a laptop, different lambdas, one truth.
//
//   MemoryStore    fallback so local dev and the build need nothing. On
//                  deployed serverless this only holds within one warm
//                  instance. That is a real limitation, not a maybe: the
//                  kitchen screen can miss orders that landed on another
//                  lambda. The kitchen page shows a plain warning when it is
//                  running on memory so a demo cannot silently half-work.
//
// Orders are stored as one jsonb column rather than normalized tables. The
// kitchen screen always wants the whole order, nothing queries inside lines,
// and a schema this young will change shape. Normalize when something needs
// to query it, not before.

import { MENU_HISTORY_SCHEMA, compareMenu, compareMenuMemory, type MenuRecord, type MenuHistory } from "./menu-document-store";
import type { Pool } from "pg";
import { OPERATION_SCHEMA, getReceipt, commitOperation, commitMemory, type Receipt, type Candidate } from "./kitchen-operations";
import { ATTEMPT_SCHEMA, settleMemory, settlePostgres, type Attempt, type AttemptResult } from "./order-acceptance";

export type OrderStatus = "new" | "accepted" | "done" | "cancelled" | "refunded";

export type OrderLine = {
  itemId: string;
  name: string;
  qty: number;
  unitCents: number; // per unit, options included
  options: string[]; // chosen option names, e.g. ["Mango Habanero"]
  lineCents: number;
};

export type Order = {
  id: string;
  number: number; // Increasing ticket sequence; retries/rollbacks may leave gaps.
  guestName: string;
  guestPhone: string;
  // Optional courtesy confirmation; delivery is tracked separately from fulfillment.
  guestEmail: string;
  note: string;
  lines: OrderLine[];
  subtotalCents: number;
  feeCents: number;
  tipCents: number;
  taxCents: number;
  totalCents: number;
  quotedMinutes: number;
  // True when any line is age-restricted. The guest acknowledged 21+ at
  // checkout and the kitchen ticket shows ID CHECK; the actual carding
  // happens at the counter, where it always has.
  hasAlcohol: boolean;
  // False until Stripe is wired: demo orders are DUE AT PICKUP and the front
  // slip prints tip and signature lines. Live prepaid orders print
  // PAID ONLINE.
  paid: boolean;
  // The guest chose cash or card at the counter, which Toast's ordering page
  // offers today, so ours does too. These orders never touch Stripe: the
  // bartender rings the slip into the Toast register like any walk-up sale,
  // and the whole 99 cent fee stays in the till since there is no charge to
  // split. Older stored orders lack the field; undefined reads as false.
  payAtPickup: boolean;
  status: OrderStatus;
  createdAt: number; // epoch ms
  acceptedAt: number | null;
  completedAt?: number;
  cancelledAt?: number;
  cancellationReason?: string;
  lastOperationId?: string;
  revision?: string; // API snapshot only; omitted from stored orders.
};

export type PrintJob = {
  id: string;
  printerId: string;
  orderId: string;
  body: string; // rendered text, template already applied
  status: "queued" | "printed" | "failed";
  createdAt: number;
};

export type KitchenState = {
  lastOperationId?: string;
  revision?: string; // API snapshot only; omitted from stored state.
  unavailable: string[]; // orderable item ids currently 86'd
  busyMinutes: 0 | 15 | 30;
  pausedUntil: number | null; // epoch ms; always set with a timer, never forever
};

export const DEFAULT_STATE: KitchenState = {
  unavailable: [],
  busyMinutes: 0,
  pausedUntil: null,
};

export interface OrderStore {
  backend: "postgres" | "memory";
  getAttempt(id: string): Promise<Attempt | null>;
  settleAttempt(attempt: Attempt, order?: Order, jobs?: PrintJob[]): Promise<AttemptResult>;
  notificationList():ReturnType<typeof notificationList>;
  dueNotifications():ReturnType<typeof dueNotifications>;
  dueDeliveryChecks():ReturnType<typeof dueDeliveryChecks>;
  dispatchNotification(id:string,render:(order:Record<string,unknown>)=>Mail,credential:string,namespace:string,send:(payload:string,key:string)=>Promise<SendResult>):ReturnType<typeof dispatchNotification>;
  checkNotification(id:string,retrieve:(id:string,payload:string)=>Promise<DeliveryResult>):ReturnType<typeof checkNotification>;
  closeNotification(command:CloseCommand):ReturnType<typeof closeNotification>;
  getNotificationReview(id:string):ReturnType<typeof getNotificationReview>;
  getOrder(id: string): Promise<Order | null>;
  // Active = new or accepted, oldest first: the kitchen works top down.
  listActiveOrders(): Promise<Order[]>;
  getOperation(id: string): Promise<Receipt | null>;
  commitKitchen(receipt: Receipt, candidate: Candidate | null): Promise<Receipt>;
  nextTicketNumber(): Promise<number>;
  getState(): Promise<KitchenState>;
  getStateRecord(): Promise<KitchenState | null>;
  resolvePrintJob(command:PrintCommand,role:"kitchen"|"front"):ReturnType<typeof resolvePrintJob>;
  getPrintAction(id:string):ReturnType<typeof getPrintAction>;
  printerPoll(id:string,poll:PrinterPoll):ReturnType<typeof pollPrintJob>;
  printerFetch(id:string,jobId:string):Promise<PrintReply>;
  printerConfirm(id:string,jobId:string,role:"kitchen"|"front",code:string):Promise<PrintReply>;
  printStatus():ReturnType<typeof printStatus>;
  // The editable menu document. null means never edited: callers seed from
  // the bundled harvest. Stored whole -- it is one restaurant's menu, edits
  // are rare, and whole-document writes cannot half-apply.
  getMenuDoc(): Promise<unknown | null>;
  getMenuRecord(): Promise<MenuRecord | null>;
  compareMenuDoc(expected: MenuRecord | null, doc: unknown, beforeDoc: unknown): Promise<MenuRecord | null>;
  menuHistory(): Promise<{ id: string; changedAt: string }[]>;
}

/* ------------------------------ memory ------------------------------ */

type MemoryBag = {
  attempts: Map<string, Attempt>;
  confirmations: Map<string, { status: string; order: Order }>;
  orders: Map<string, Order>;
  state: KitchenState | null;
  operations?: Map<string, Receipt>;
  ticket: number;
  printJobs: PrintJob[];
  printersSeen: Record<string, number>;
  menuDoc: unknown | null;
  menuRevision?: string;
  menuHistory?: MenuHistory[];
};

function memoryBag(): MemoryBag {
  const g = globalThis as unknown as { __copperOrdering?: MemoryBag };
  if (!g.__copperOrdering) {
    g.__copperOrdering = {
      attempts: new Map(), confirmations: new Map(),
      orders: new Map(),
      state: null, operations: new Map(),
      ticket: 0,
      printJobs: [],
      printersSeen: {},
      menuDoc: null,
    };
  }
  return g.__copperOrdering;
}

const memoryStore: OrderStore = {
  backend: "memory",
  async getAttempt(id) { return structuredClone(memoryBag().attempts?.get(id) ?? null); },
  async settleAttempt(attempt, order, jobs) {
    requireDurableWrite(); const bag = memoryBag(); bag.attempts ??= new Map(); bag.confirmations ??= new Map();
    return settleMemory(bag, attempt, order, jobs);
  },
  async notificationList(){return {items:[],count:0};},
  async dueNotifications(){return [];},async dueDeliveryChecks(){return [];},
  async dispatchNotification(){throw Error("Persistent notification storage is required.");},
  async checkNotification(){throw Error("Persistent notification storage is required.");},
  async closeNotification(){throw Error("Persistent notification storage is required.");},
  async getNotificationReview(){return null;},
  async getOrder(id) {
    return structuredClone(memoryBag().orders.get(id) ?? null);
  },
  async listActiveOrders() {
    return [...memoryBag().orders.values()]
      .filter((o) => o.status === "new" || o.status === "accepted")
      .sort((a, b) => a.createdAt - b.createdAt).map(o => structuredClone(o));
  },
  async getOperation(id) { return structuredClone(memoryBag().operations?.get(id) ?? null); },
  async commitKitchen(receipt, candidate) {
    requireDurableWrite(); const bag=memoryBag(); bag.operations ??= new Map();
    const current=candidate?.table === "ordering_state" ? bag.state : candidate ? bag.orders.get(String(candidate.key)) ?? null : null;
    const result=commitMemory(bag.operations,current,receipt,candidate);
    if(result.changed && candidate) {
      if(candidate.table === "ordering_state") bag.state=result.value as KitchenState;
      else {
        const order=result.value as Order; bag.orders.set(String(candidate.key),order);
        if(order.status === "cancelled") for(const job of bag.printJobs) if(job.orderId===order.id && job.status==="queued")job.status="failed";
      }
    }
    return result.receipt;
  },
  async nextTicketNumber() {
    requireDurableWrite();
    return ++memoryBag().ticket;
  },
  async getState() {
    return structuredClone(memoryBag().state ?? DEFAULT_STATE);
  },
  async getStateRecord() { return structuredClone(memoryBag().state); },
  async resolvePrintJob() { throw Error("Persistent storage is required for physical printer delivery."); },
  async getPrintAction() { return null; },
  async printerPoll() { throw Error("Persistent storage is required for physical printer delivery."); },
  async printerFetch() { throw Error("Persistent storage is required for physical printer delivery."); },
  async printerConfirm() { throw Error("Persistent storage is required for physical printer delivery."); },
  async printStatus() { return {devices:[],issues:[],issueCount:0}; },
  async getMenuDoc() {
    return structuredClone(memoryBag().menuDoc);
  },
  async getMenuRecord() { const bag=memoryBag();return bag.menuDoc===null?null:{doc:structuredClone(bag.menuDoc),revision:bag.menuRevision??"legacy"}; },
  async compareMenuDoc(expected,doc,beforeDoc) {
    requireDurableWrite(); const bag=memoryBag();bag.menuHistory??=[];
    const current=bag.menuDoc===null?null:{doc:bag.menuDoc,revision:bag.menuRevision??"legacy"};
    const record=compareMenuMemory(current,bag.menuHistory,expected,doc,beforeDoc);
    if(record){bag.menuDoc=structuredClone(record.doc);bag.menuRevision=record.revision;}return record;
  },
  async menuHistory() { return (memoryBag().menuHistory??[]).slice(-10).reverse().map(({id,changedAt})=>({id,changedAt})); },
};

/* ----------------------------- postgres ----------------------------- */

function connectionString(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  const values = [...new Set(Object.entries(process.env).filter(([key, value]) => value && /_(DATABASE|POSTGRES)_URL$/.test(key)).map(([, value]) => value!))];
  if (values.length > 1) throw new Error("Multiple ordering databases configured. Choose DATABASE_URL explicitly.");
  return values[0];
}

async function pgPool(): Promise<Pool> {
  const g = globalThis as unknown as { __copperPgPool?: Pool; __copperPgReady?: Promise<void> };
  if (!g.__copperPgReady) {
    g.__copperPgReady = (async () => {
      const { Pool } = await import("pg"); const cs = connectionString();
      if (!cs) throw new Error("Persistent ordering storage is not configured.");
      // Honor explicit pg connection settings; do not disable certificate checks.
      g.__copperPgPool = new Pool({ connectionString: cs, max: 3, connectionTimeoutMillis: 7000 });
      await g.__copperPgPool.query(`SELECT pg_advisory_xact_lock(4213711);
CREATE TABLE IF NOT EXISTS ordering_orders (
          id text PRIMARY KEY,
          status text NOT NULL,
          created_at bigint NOT NULL,
          data jsonb NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ordering_state (
          id int PRIMARY KEY DEFAULT 1,
          data jsonb NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ordering_print_jobs (
          id text PRIMARY KEY,
          printer_id text NOT NULL,
          order_id text NOT NULL,
          body text NOT NULL,
          status text NOT NULL,
          created_at bigint NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ordering_printers (
          id text PRIMARY KEY,
          last_seen bigint NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ordering_menu (
          id int PRIMARY KEY DEFAULT 1,
          data jsonb NOT NULL
        );
        CREATE SEQUENCE IF NOT EXISTS ordering_ticket;
${ATTEMPT_SCHEMA}
${OPERATION_SCHEMA}
${PRINT_SCHEMA}
${NOTIFICATION_SCHEMA}
${MENU_HISTORY_SCHEMA}`);
    })().catch(async (error: unknown) => {
      const failed = g.__copperPgPool; g.__copperPgPool = undefined; g.__copperPgReady = undefined;
      await failed?.end().catch(() => {}); throw error;
    });
  }
  await g.__copperPgReady; return g.__copperPgPool!;
}

async function orderingTransaction<T>(work:(query:Query)=>Promise<T>):Promise<T>{
  const client=await (await pgPool()).connect();
  try{
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    const result=await work((sql,params)=>client.query(sql,params));
    await client.query("COMMIT");return result;
  }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}
  finally{client.release();}
}

const postgresStore: OrderStore = {
  backend: "postgres",
  async getAttempt(id) { const pool = await pgPool(); const result = await pool.query("SELECT data FROM ordering_attempts WHERE id=$1", [id]); return result.rows[0]?.data ?? null; },
  async settleAttempt(attempt, order, jobs) { const pool = await pgPool(); return settlePostgres((sql, params) => pool.query(sql, params), attempt, order, jobs); },
  async notificationList(){const pool=await pgPool();return notificationList((sql,p)=>pool.query(sql,p));},
  async dueNotifications(){const pool=await pgPool();return dueNotifications((sql,p)=>pool.query(sql,p));},
  async dueDeliveryChecks(){const pool=await pgPool();return dueDeliveryChecks((sql,p)=>pool.query(sql,p));},
  dispatchNotification:(id,render,credential,namespace,send)=>dispatchNotification(orderingTransaction,id,render,credential,namespace,send),
  checkNotification:(id,retrieve)=>checkNotification(orderingTransaction,id,retrieve),
  closeNotification:command=>closeNotification(orderingTransaction,command),
  async getNotificationReview(id){const pool=await pgPool();return getNotificationReview((sql,p)=>pool.query(sql,p),id);},
  async getOrder(id) {
    const pool = await pgPool();
    const r = await pool.query(`SELECT data FROM ordering_orders WHERE id = $1`, [id]);
    return r.rows[0] ? (r.rows[0].data as Order) : null;
  },
  async listActiveOrders() {
    const pool = await pgPool();
    const r = await pool.query(
      `SELECT data FROM ordering_orders WHERE status IN ('new', 'accepted') ORDER BY created_at ASC LIMIT 100`
    );
    return r.rows.map((row) => row.data as Order);
  },
  async getOperation(id) { const pool=await pgPool(); return getReceipt((sql,params)=>pool.query(sql,params),id); },
  async commitKitchen(receipt,candidate) { const pool=await pgPool(); return commitOperation((sql,params)=>pool.query(sql,params),receipt,candidate); },
  async nextTicketNumber() {
    const pool = await pgPool();
    const r = await pool.query(`SELECT nextval('ordering_ticket') AS n`);
    return Number(r.rows[0].n);
  },
  async getState() {
    const pool = await pgPool();
    const r = await pool.query(`SELECT data FROM ordering_state WHERE id = 1`);
    return r.rows[0] ? (r.rows[0].data as KitchenState) : { ...DEFAULT_STATE };
  },
  async getStateRecord() {
    const pool=await pgPool(); const result=await pool.query("SELECT data FROM ordering_state WHERE id=1");
    return result.rows[0]?.data ?? null;
  },
  resolvePrintJob:(command,role)=>resolvePrintJob(orderingTransaction,command,role),
  async getPrintAction(id) { const pool=await pgPool(); return getPrintAction((sql,params)=>pool.query(sql,params),id); },
  printerPoll:(id,poll)=>pollPrintJob(orderingTransaction,id,poll),
  printerFetch:(id,jobId)=>fetchPrintJob(orderingTransaction,id,jobId),
  printerConfirm:(id,jobId,role,code)=>confirmPrintJob(orderingTransaction,id,jobId,role,code),
  async printStatus() {const pool=await pgPool();return printStatus((sql,params)=>pool.query(sql,params));},
  async getMenuDoc() {
    const pool = await pgPool();
    const r = await pool.query(`SELECT data FROM ordering_menu WHERE id = 1`);
    return r.rows[0] ? r.rows[0].data : null;
  },
  async getMenuRecord() {
    const result=await (await pgPool()).query("SELECT data,revision FROM ordering_menu WHERE id=1");
    return result.rows[0]?{doc:result.rows[0].data,revision:String(result.rows[0].revision)}:null;
  },
  async compareMenuDoc(expected,doc,beforeDoc) { const pool=await pgPool();return compareMenu((sql,params)=>pool.query(sql,params),expected,doc,beforeDoc); },
  async menuHistory() {
    const result=await (await pgPool()).query("SELECT id,changed_at FROM ordering_menu_history ORDER BY changed_at DESC,id DESC LIMIT 10");
    return result.rows.map(r=>({id:r.id,changedAt:new Date(r.changed_at).toISOString()}));
  },
};

export function getStore(): OrderStore {
  return connectionString() ? postgresStore : memoryStore;
}

// An expired pause is over, whoever forgot to tap resume. Reading through this
// helper is what makes the auto-resume real rather than aspirational.
export function effectiveState(state: KitchenState, now: number = Date.now()): KitchenState {
  if (state.pausedUntil !== null && state.pausedUntil <= now) {
    return { ...state, pausedUntil: null };
  }
  return state;
}

function requireDurableWrite() { if (process.env.NODE_ENV === "production") throw new Error("Persistent storage is required for ordering writes."); }
