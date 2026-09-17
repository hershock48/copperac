import { randomUUID } from "node:crypto";

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** Event JSON and its audit snapshot commit together. Archive is a row update. */
export async function compareEvent(query: Query, key: string, expected: unknown, value: unknown): Promise<boolean> {
  const change = expected === null
    ? `INSERT INTO workroom_events (key,data) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO NOTHING RETURNING key,data`
    : `UPDATE workroom_events SET data=$2::jsonb WHERE key=$1 AND data=$3::jsonb RETURNING key,data`;
  const result = await query(`WITH changed AS (${change}), audited AS (
    INSERT INTO workroom_content_history (id,key,changed_at,actor,before_data,after_data)
    SELECT $4,'event:'||key,$5::timestamptz,'owner',$3::jsonb,data FROM changed RETURNING id
  ) SELECT id FROM audited`, [key, JSON.stringify(value), JSON.stringify(expected), randomUUID(), new Date().toISOString()]);
  return result.rows.length === 1;
}
