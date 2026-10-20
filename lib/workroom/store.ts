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
 *   memory     so local dev and the build need nothing. Deployed, this only
 *              holds within one warm lambda, so a saved event can vanish on
 *              the next cold start. Every workroom screen says so in plain
 *              words when it is on memory, because a screen that half-saves
 *              silently is worse than one that says what is wrong.
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
  /** Ids and timestamps only, newest first: a sweep over photos must not
      pull every photo's bytes into the lambda to learn which are unused. */
  meta(limit?: number): Promise<Row[]>;
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
      rows().set(row.id, row);
    },
    async remove(id) {
      rows().delete(id);
    },
    async list(limit = 1000) {
      return [...rows().values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    },
    async meta(limit = 1000) {
      return (await this.list(limit)).map(({ id, createdAt }) => ({ id, createdAt }));
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
  const keys = Object.keys(env).sort();
  return (
    keys.find((k) => k.endsWith("_DATABASE_URL") && env[k]) ??
    keys.find((k) => k.endsWith("_POSTGRES_URL") && env[k]) ??
    null
  );
}

function connectionString(): string | undefined {
  const name = connectionVar();
  return name ? process.env[name] : undefined;
}

type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  /** Optional so a test double can stand in with query() alone. */
  end?: () => Promise<void>;
};

const JSON_TABLES = ["workroom_content", "workroom_events", "workroom_images"] as const;

async function pgPool(): Promise<PgPool> {
  const g = globalThis as typeof globalThis & { __copperWorkroomReady?: Promise<PgPool> };
  /*
    ONE promise, set before the first await. The earlier shape awaited the
    import of pg and only then assigned the global, so two callers arriving
    together on a cold start (getMenus runs the overrides and the additions
    reads side by side) each built a Pool and ran the schema init, the
    second overwrote the first, and a failure in either could clear the
    global under the other (review, 20 Oct 2026). Now the second caller
    finds the promise and waits on it.

    The init takes an advisory lock because the customer pages read this
    store at BUILD time and Next prerenders with several workers at once;
    CREATE TABLE IF NOT EXISTS is not atomic against a concurrent creator
    (anchor's first facts deploy died exactly there). A failed init is
    never cached: the promise is dropped so the next request retries, and
    the failed pool is closed on the way out rather than left holding its
    sockets (Neon counts connections; from the closed intake-trace branch).
  */
  if (!g.__copperWorkroomReady) {
    g.__copperWorkroomReady = (async () => {
      // The whole body is inside the try: a throw from the import or the
      // constructor would otherwise leave a rejected promise cached for the
      // life of the process (second review, 20 Oct 2026).
      let pool: PgPool | undefined;
      try {
        const { Pool } = await import("pg");
        const cs = connectionString();
        const local = /localhost|127\.0\.0\.1|\[::1\]/.test(cs ?? "") || cs?.includes("sslmode=disable");
        pool = new Pool({
          connectionString: cs,
          ssl: local ? undefined : { rejectUnauthorized: false },
          max: 3,
        }) as unknown as PgPool;
        const creates = JSON_TABLES.map(
          (t) => `CREATE TABLE IF NOT EXISTS ${t} (key text PRIMARY KEY, data jsonb NOT NULL);`
        ).join("\n");
        await pool.query(`SELECT pg_advisory_xact_lock(4213702);\n${creates}`);
        return pool;
      } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        // Two workers racing the same CREATE: the table exists, which is what we wanted.
        if (pool && (code === "23505" || code === "42P07")) return pool;
        g.__copperWorkroomReady = undefined;
        if (pool?.end) await pool.end().catch(() => {});
        throw err;
      }
    })();
  }
  return g.__copperWorkroomReady;
}

function pgCollection<T extends Row>(table: (typeof JSON_TABLES)[number]): Collection<T> {
  return {
    async get(id) {
      const pool = await pgPool();
      const { rows } = await pool.query(`SELECT data FROM ${table} WHERE key = $1`, [id]);
      return rows.length ? (rows[0].data as T) : null;
    },
    async put(row) {
      const pool = await pgPool();
      await pool.query(
        `INSERT INTO ${table} (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2`,
        [row.id, JSON.stringify(row)]
      );
    },
    async remove(id) {
      const pool = await pgPool();
      await pool.query(`DELETE FROM ${table} WHERE key = $1`, [id]);
    },
    async list(limit = 1000) {
      const pool = await pgPool();
      const { rows } = await pool.query(
        `SELECT data FROM ${table} ORDER BY (data->>'createdAt')::bigint DESC NULLS LAST LIMIT $1`,
        [limit]
      );
      return rows.map((r) => r.data as T);
    },
    async meta(limit = 1000) {
      const pool = await pgPool();
      // pg hands int8 back as a string, hence the Number().
      const { rows } = await pool.query(
        `SELECT key, (data->>'createdAt')::bigint AS created FROM ${table} ORDER BY created DESC NULLS LAST LIMIT $1`,
        [limit]
      );
      return rows.map((r) => ({ id: String(r.key), createdAt: Number(r.created) }));
    },
  };
}

const postgresStore: Store = {
  backend: "postgres",
  events: pgCollection<WorkroomEvent>("workroom_events"),
  images: pgCollection<StoredImage>("workroom_images"),
  async getValue(key) {
    const pool = await pgPool();
    const { rows } = await pool.query(`SELECT data FROM workroom_content WHERE key = $1`, [key]);
    return rows.length ? (rows[0].data as never) : null;
  },
  async setValue(key, value) {
    const pool = await pgPool();
    await pool.query(
      `INSERT INTO workroom_content (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2`,
      [key, JSON.stringify(value)]
    );
  },
};

export function getStore(): Store {
  return connectionString() ? postgresStore : memoryStore;
}
