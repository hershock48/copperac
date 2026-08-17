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

export type OrderStatus = "new" | "accepted" | "done";

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
  status: OrderStatus;
  createdAt: number; // epoch ms
  acceptedAt: number | null;
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
}

/* ------------------------------ memory ------------------------------ */

type MemoryBag = {
  orders: Map<string, Order>;
  state: KitchenState;
  ticket: number;
};

function memoryBag(): MemoryBag {
  const g = globalThis as unknown as { __copperOrdering?: MemoryBag };
  if (!g.__copperOrdering) {
    g.__copperOrdering = { orders: new Map(), state: { ...DEFAULT_STATE }, ticket: 0 };
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
      .filter((o) => o.status !== "done")
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
      `SELECT data FROM ordering_orders WHERE status != 'done' ORDER BY created_at ASC LIMIT 100`
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
