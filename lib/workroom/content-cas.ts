import { createHash, randomUUID } from "node:crypto";

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type ContentAudit = { id: string; key: string; changedAt: string; actor: string; before: unknown; after: unknown };
export const CONTENT_HISTORY_SCHEMA = `CREATE TABLE IF NOT EXISTS workroom_content_history (id text PRIMARY KEY, key text NOT NULL, changed_at timestamptz NOT NULL, actor text NOT NULL, before_data jsonb, after_data jsonb NOT NULL);`;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
}
export const contentRevision = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");

/** Mutation and audit succeed or roll back as one PostgreSQL statement. */
export async function compareContent(query: Query, key: string, expected: unknown, value: unknown, actor = "owner"): Promise<boolean> {
  const change = expected === null
    ? `INSERT INTO workroom_content (key,data) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data WHERE workroom_content.data=$3::jsonb RETURNING key,data`
    : `UPDATE workroom_content SET data=$2::jsonb WHERE key=$1 AND data=$3::jsonb RETURNING key,data`;
  const result = await query(`WITH changed AS (${change}), audited AS (
    INSERT INTO workroom_content_history (id,key,changed_at,actor,before_data,after_data)
    SELECT $4,key,$5::timestamptz,$6,$3::jsonb,data FROM changed RETURNING id
  ) SELECT id FROM audited`, [key, JSON.stringify(value), JSON.stringify(expected), randomUUID(), new Date().toISOString(), actor]);
  return result.rows.length === 1;
}

export function compareMemory(content: Map<string, unknown>, history: ContentAudit[], key: string, expected: unknown, value: unknown): boolean {
  if (contentRevision(content.get(key) ?? null) !== contentRevision(expected)) return false;
  const after = structuredClone(value);
  history.push({ id: randomUUID(), key, changedAt: new Date().toISOString(), actor: "owner", before: structuredClone(expected), after });
  content.set(key, structuredClone(value));
  return true;
}
