import "server-only";

/**
 * Workroom storage: the events the planner writes, the photos that go with
 * them, and the menu edits laid over lib/menu.ts.
 *
 * Ported from anchor's `lib/workroom/store.ts` (itself from devine, itself
 * from pjs): two backends behind one shape, one jsonb row per record, tables
 * that create themselves, and a failed schema init that is never cached.
 *
 *   postgres   when a database URL is set. One click in Vercel: project >
 *              Storage > Create Database > Neon, free tier. The same
 *              database the parked ordering system would use; different
 *              tables, no overlap.
 *
 *   memory     for local development and build-time reads. Production writes
 *              are rejected so a temporary save cannot be mistaken for a
 *              durable owner edit.
 *
 * Photos live here too, as base64 in their own table, served by
 * app/img/events/[id]. A bar's events run to a handful a month and a resized
 * flyer is ~150KB, so a second storage product for a few megabytes a year
 * is not worth the extra dashboard step. The upload route caps the size.
 */

import type { WorkroomEvent } from "./events-def";

type Row = { id: string; createdAt: number };

export type StoredImage = Row & {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

export type Collection<T extends Row> = {
  get(id: string): Promise<T | null>;
  put(row: T): Promise<void>;
  remove(id: string): Promise<void>;
  /** Newest first. */
  list(limit?: number): Promise<T[]>;
};

export type Store = {
  backend: "postgres" | "memory";
  events: Collection<WorkroomEvent>;
  images: Collection<StoredImage>;
  /** One named jsonb value. Null when nothing has been saved under the key. */
  getValue<T>(key: string): Promise<T | null>;
  setValue(key: string, value: unknown): Promise<void>;
};

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------ memory ------------------------------ */

type Bag = { content: Map<string, unknown>; tables: Map<string, Map<string, Row>> };

function bag(): Bag {
  const g = globalThis as typeof globalThis & { __copperWorkroomBag?: Bag };
  if (!g.__copperWorkroomBag) g.__copperWorkroomBag = { content: new Map(), tables: new Map() };
  return g.__copperWorkroomBag;
}

function memoryCollection<T extends Row>(table: string): Collection<T> {
  const rows = () => {
    const t = bag().tables;
    if (!t.has(table)) t.set(table, new Map());
    return t.get(table)! as Map<string, T>;
  };
  return {
    async get(id) {
      return rows().get(id) ?? null;
    },
    async put(row) {
      requireDurableWrite();
      rows().set(row.id, row);
    },
    async remove(id) {
      requireDurableWrite();
      rows().delete(id);
    },
    async list(limit = 1000) {
      return [...rows().values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    },
  };
}

const memoryStore: Store = {
  backend: "memory",
  events: memoryCollection<WorkroomEvent>("workroom_events"),
  images: memoryCollection<StoredImage>("workroom_images"),
  async getValue(key) {
    return (bag().content.get(key) as never) ?? null;
  },
  async setValue(key, value) {
    requireDurableWrite();
    bag().content.set(key, value);
  },
};

/* ----------------------------- postgres ----------------------------- */

/**
 * The env var holding the database URL, by name. The Vercel/Neon
 * integration injects PREFIXED names in real situations (observed:
 * DATABASE_CASCARELLIS_DATABASE_URL), so the exact-suffix match is what
 * spares an operator from hand-copying a secret between env rows.
 */
export function connectionVar(): string | null {
  const env = process.env;
  if (env.DATABASE_URL) return "DATABASE_URL";
  if (env.POSTGRES_URL) return "POSTGRES_URL";
  const keys = Object.keys(env).filter(k => (k.endsWith("_DATABASE_URL") || k.endsWith("_POSTGRES_URL")) && env[k]);
  // Never choose an arbitrary client database when several integrations exist.
  const values = new Set(keys.map(k => env[k]));
  return values.size === 1 ? keys.sort()[0] : null;
}

function connectionString(): string | undefined {
  const name = connectionVar();
  return name ? process.env[name] : undefined;
}

type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const JSON_TABLES = ["workroom_content", "workroom_events", "workroom_images"] as const;

export async function workroomDatabase(): Promise<PgPool> {
  const g = globalThis as typeof globalThis & {
    __copperWorkroomPool?: PgPool;
    __copperWorkroomReady?: Promise<unknown>;
  };
  if (!g.__copperWorkroomReady) {
    g.__copperWorkroomReady = (async () => {
    const { Pool } = await import("pg");
    const cs = connectionString();
    if (!cs) throw new Error("Persistent workroom storage is not configured.");
    g.__copperWorkroomPool = new Pool({
      connectionString: cs,
      max: 3,
      connectionTimeoutMillis: 7000,
    }) as unknown as PgPool;
    /*
      The init takes an advisory lock because the customer pages read this
      store at BUILD time and Next prerenders with several workers at once;
      CREATE TABLE IF NOT EXISTS is not atomic against a concurrent creator
      (anchor's first facts deploy died exactly there). A failed init is
      never cached: pool and promise are dropped so the next request retries.
    */
    const creates = JSON_TABLES.map(
      (t) => `CREATE TABLE IF NOT EXISTS ${t} (key text PRIMARY KEY, data jsonb NOT NULL);`
    ).join("\n") + "\nCREATE TABLE IF NOT EXISTS copper_login_attempts (id text PRIMARY KEY, attempts integer NOT NULL, started bigint NOT NULL);";
    await g.__copperWorkroomPool.query(`SELECT pg_advisory_xact_lock(4213702);\n${creates}`);
    })().catch((err: unknown) => {
        g.__copperWorkroomPool = undefined;
        g.__copperWorkroomReady = undefined;
        throw err;
      });
  }
  await g.__copperWorkroomReady;
  return g.__copperWorkroomPool!;
}

function pgCollection<T extends Row>(table: (typeof JSON_TABLES)[number]): Collection<T> {
  return {
    async get(id) {
      const pool = await workroomDatabase();
      const { rows } = await pool.query(`SELECT data FROM ${table} WHERE key = $1`, [id]);
      return rows.length ? (rows[0].data as T) : null;
    },
    async put(row) {
      const pool = await workroomDatabase();
      await pool.query(
        `INSERT INTO ${table} (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2`,
        [row.id, JSON.stringify(row)]
      );
    },
    async remove(id) {
      const pool = await workroomDatabase();
      await pool.query(`DELETE FROM ${table} WHERE key = $1`, [id]);
    },
    async list(limit = 1000) {
      const pool = await workroomDatabase();
      const { rows } = await pool.query(
        `SELECT data FROM ${table} ORDER BY (data->>'createdAt')::bigint DESC NULLS LAST LIMIT $1`,
        [limit]
      );
      return rows.map((r) => r.data as T);
    },
  };
}

const postgresStore: Store = {
  backend: "postgres",
  events: pgCollection<WorkroomEvent>("workroom_events"),
  images: pgCollection<StoredImage>("workroom_images"),
  async getValue(key) {
    const pool = await workroomDatabase();
    const { rows } = await pool.query(`SELECT data FROM workroom_content WHERE key = $1`, [key]);
    return rows.length ? (rows[0].data as never) : null;
  },
  async setValue(key, value) {
    const pool = await workroomDatabase();
    await pool.query(
      `INSERT INTO workroom_content (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2`,
      [key, JSON.stringify(value)]
    );
  },
};

export function getStore(): Store {
  return connectionString() ? postgresStore : memoryStore;
}

function requireDurableWrite() {
  if (process.env.NODE_ENV === "production") throw new Error("Persistent storage is required for workroom edits.");
}
