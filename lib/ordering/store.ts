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

import type { Pool } from "pg";

export type OrderStatus = "new" | "accepted" | "done" | "refunded";

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
  number: number; // short ticket number, resets daily in practice
  guestName: string;
  guestPhone: string;
  // Optional; when present the guest gets a confirmation email and, if it
  // comes to it, the refund notice with the 5-10 business day expectation.
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
  // slip prints tip and signature lines. Live orders are prepaid and print
  // PAID ONLINE.
  paid: boolean;
  status: OrderStatus;
  createdAt: number; // epoch ms
  acceptedAt: number | null;
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
  createOrder(order: Order): Promise<void>;
  getOrder(id: string): Promise<Order | null>;
  // Active = new or accepted, oldest first: the kitchen works top down.
  listActiveOrders(): Promise<Order[]>;
  setOrderStatus(id: string, status: OrderStatus): Promise<void>;
  nextTicketNumber(): Promise<number>;
  getState(): Promise<KitchenState>;
  setState(state: KitchenState): Promise<void>;
  // Printing. Jobs are queued at order time and drained by each printer's
  // polls; stale queued jobs are skipped at poll time via the TTL so a
  // printer that was off for an hour does not print cold orders.
  enqueuePrintJob(job: PrintJob): Promise<void>;
  nextPrintJob(printerId: string, notOlderThanMs: number): Promise<PrintJob | null>;
  setPrintJobStatus(id: string, status: "printed" | "failed"): Promise<void>;
  printerSeen(printerId: string): Promise<void>;
  printerLastSeen(): Promise<Record<string, number>>;
  // The editable menu document. null means never edited: callers seed from
  // the bundled harvest. Stored whole -- it is one restaurant's menu, edits
  // are rare, and whole-document writes cannot half-apply.
  getMenuDoc(): Promise<unknown | null>;
  setMenuDoc(doc: unknown): Promise<void>;
}

/* ------------------------------ memory ------------------------------ */

type MemoryBag = {
  orders: Map<string, Order>;
  state: KitchenState;
  ticket: number;
  printJobs: PrintJob[];
  printersSeen: Record<string, number>;
  menuDoc: unknown | null;
};

function memoryBag(): MemoryBag {
  const g = globalThis as unknown as { __copperOrdering?: MemoryBag };
  if (!g.__copperOrdering) {
    g.__copperOrdering = {
      orders: new Map(),
      state: { ...DEFAULT_STATE },
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
  async createOrder(order) {
    memoryBag().orders.set(order.id, order);
  },
  async getOrder(id) {
    return memoryBag().orders.get(id) ?? null;
  },
  async listActiveOrders() {
    return [...memoryBag().orders.values()]
      .filter((o) => o.status !== "done" && o.status !== "refunded")
      .sort((a, b) => a.createdAt - b.createdAt);
  },
  async setOrderStatus(id, status) {
    const o = memoryBag().orders.get(id);
    if (o) {
      o.status = status;
      if (status === "accepted" && o.acceptedAt === null) o.acceptedAt = Date.now();
    }
  },
  async nextTicketNumber() {
    return ++memoryBag().ticket;
  },
  async getState() {
    return memoryBag().state;
  },
  async setState(state) {
    memoryBag().state = state;
  },
  async enqueuePrintJob(job) {
    memoryBag().printJobs.push(job);
  },
  async nextPrintJob(printerId, notOlderThanMs) {
    const cutoff = Date.now() - notOlderThanMs;
    const bag = memoryBag();
    // Expire stale queued jobs so an offline printer never prints cold food.
    for (const j of bag.printJobs) {
      if (j.status === "queued" && j.createdAt < cutoff) j.status = "failed";
    }
    return bag.printJobs.find((j) => j.printerId === printerId && j.status === "queued") ?? null;
  },
  async setPrintJobStatus(id, status) {
    const j = memoryBag().printJobs.find((x) => x.id === id);
    if (j) j.status = status;
  },
  async printerSeen(printerId) {
    memoryBag().printersSeen[printerId] = Date.now();
  },
  async printerLastSeen() {
    return { ...memoryBag().printersSeen };
  },
  async getMenuDoc() {
    return memoryBag().menuDoc;
  },
  async setMenuDoc(doc) {
    memoryBag().menuDoc = doc;
  },
};

/* ----------------------------- postgres ----------------------------- */

function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

async function pgPool(): Promise<Pool> {
  const g = globalThis as unknown as { __copperPgPool?: Pool; __copperPgReady?: Promise<void> };
  if (!g.__copperPgPool) {
    // Dynamic import so the module (and the dependency) never loads unless a
    // database is actually configured.
    const { Pool } = await import("pg");
    g.__copperPgPool = new Pool({
      connectionString: connectionString(),
      // Neon and friends require TLS; local postgres usually has none.
      ssl: connectionString()?.includes("localhost") ? undefined : { rejectUnauthorized: false },
      max: 3,
    });
    g.__copperPgReady = (async () => {
      await g.__copperPgPool!.query(`
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
      `);
    })();
  }
  await g.__copperPgReady;
  return g.__copperPgPool;
}

const postgresStore: OrderStore = {
  backend: "postgres",
  async createOrder(order) {
    const pool = await pgPool();
    await pool.query(
      `INSERT INTO ordering_orders (id, status, created_at, data) VALUES ($1, $2, $3, $4)`,
      [order.id, order.status, order.createdAt, JSON.stringify(order)]
    );
  },
  async getOrder(id) {
    const pool = await pgPool();
    const r = await pool.query(`SELECT data FROM ordering_orders WHERE id = $1`, [id]);
    return r.rows[0] ? (r.rows[0].data as Order) : null;
  },
  async listActiveOrders() {
    const pool = await pgPool();
    const r = await pool.query(
      `SELECT data FROM ordering_orders WHERE status NOT IN ('done', 'refunded') ORDER BY created_at ASC LIMIT 100`
    );
    return r.rows.map((row) => row.data as Order);
  },
  async setOrderStatus(id, status) {
    const pool = await pgPool();
    await pool.query(
      `UPDATE ordering_orders
       SET status = $2,
           data = data || jsonb_build_object('status', $2::text)
                       || CASE WHEN $2 = 'accepted' AND (data->>'acceptedAt') IS NULL
                               THEN jsonb_build_object('acceptedAt', $3::bigint)
                               ELSE '{}'::jsonb END
       WHERE id = $1`,
      [id, status, Date.now()]
    );
  },
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
  async setState(state) {
    const pool = await pgPool();
    await pool.query(
      `INSERT INTO ordering_state (id, data) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET data = $1`,
      [JSON.stringify(state)]
    );
  },
  async enqueuePrintJob(job) {
    const pool = await pgPool();
    await pool.query(
      `INSERT INTO ordering_print_jobs (id, printer_id, order_id, body, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [job.id, job.printerId, job.orderId, job.body, job.status, job.createdAt]
    );
  },
  async nextPrintJob(printerId, notOlderThanMs) {
    const pool = await pgPool();
    const cutoff = Date.now() - notOlderThanMs;
    await pool.query(
      `UPDATE ordering_print_jobs SET status = 'failed'
       WHERE status = 'queued' AND created_at < $1`,
      [cutoff]
    );
    const r = await pool.query(
      `SELECT id, printer_id, order_id, body, status, created_at
       FROM ordering_print_jobs
       WHERE printer_id = $1 AND status = 'queued'
       ORDER BY created_at ASC LIMIT 1`,
      [printerId]
    );
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    return {
      id: row.id,
      printerId: row.printer_id,
      orderId: row.order_id,
      body: row.body,
      status: row.status,
      createdAt: Number(row.created_at),
    };
  },
  async setPrintJobStatus(id, status) {
    const pool = await pgPool();
    await pool.query(`UPDATE ordering_print_jobs SET status = $2 WHERE id = $1`, [id, status]);
  },
  async printerSeen(printerId) {
    const pool = await pgPool();
    await pool.query(
      `INSERT INTO ordering_printers (id, last_seen) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET last_seen = $2`,
      [printerId, Date.now()]
    );
  },
  async printerLastSeen() {
    const pool = await pgPool();
    const r = await pool.query(`SELECT id, last_seen FROM ordering_printers`);
    return Object.fromEntries(r.rows.map((row) => [row.id, Number(row.last_seen)]));
  },
  async getMenuDoc() {
    const pool = await pgPool();
    const r = await pool.query(`SELECT data FROM ordering_menu WHERE id = 1`);
    return r.rows[0] ? r.rows[0].data : null;
  },
  async setMenuDoc(doc) {
    const pool = await pgPool();
    await pool.query(
      `INSERT INTO ordering_menu (id, data) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET data = $1`,
      [JSON.stringify(doc)]
    );
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
