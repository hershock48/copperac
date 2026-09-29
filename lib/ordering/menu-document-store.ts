import { randomUUID } from "node:crypto";
import { contentRevision } from "../workroom/content-cas";
export type MenuRecord={doc:unknown;revision:string};
export type MenuHistory={id:string;changedAt:string;before:unknown;after:unknown};
type Query=(sql:string,params?:unknown[])=>Promise<{rows:Record<string,unknown>[]} >;
export const MENU_HISTORY_SCHEMA=`ALTER TABLE ordering_menu ADD COLUMN IF NOT EXISTS revision text NOT NULL DEFAULT 'legacy';
CREATE TABLE IF NOT EXISTS ordering_menu_history(id text PRIMARY KEY,changed_at timestamptz NOT NULL,before_data jsonb NOT NULL,after_data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS ordering_menu_history_date ON ordering_menu_history(changed_at);`;
export const menuRevision=(record:MenuRecord|null,doc:unknown)=>contentRevision({record,doc});
export async function compareMenu(query:Query,expected:MenuRecord|null,doc:unknown,beforeDoc:unknown):Promise<MenuRecord|null>{
 const id=randomUUID(),at=new Date().toISOString();
 const change=expected===null
  ? "INSERT INTO ordering_menu(id,data,revision) SELECT 1,$1::jsonb,$2 WHERE $3::text IS NULL AND $4::jsonb='null'::jsonb ON CONFLICT(id) DO NOTHING RETURNING data,revision"
  : "UPDATE ordering_menu SET data=$1::jsonb,revision=$2 WHERE id=1 AND revision=$3 AND data=$4::jsonb RETURNING data,revision";
 const result=await query(`WITH changed AS (${change}), audited AS (
 INSERT INTO ordering_menu_history(id,changed_at,before_data,after_data)
 SELECT $2,$5::timestamptz,$6::jsonb,data FROM changed RETURNING id)
 SELECT data,revision FROM changed WHERE EXISTS(SELECT 1 FROM audited)`,[JSON.stringify(doc),id,expected?.revision??null,JSON.stringify(expected?.doc??null),at,JSON.stringify(beforeDoc)]);
 return result.rows[0]?{doc:result.rows[0].data,revision:String(result.rows[0].revision)}:null;
}
export function compareMenuMemory(current:MenuRecord|null,history:MenuHistory[],expected:MenuRecord|null,doc:unknown,beforeDoc:unknown):MenuRecord|null{
 if(contentRevision(current)!==contentRevision(expected))return null;
 const record={doc:structuredClone(doc),revision:randomUUID()},entry={id:record.revision,changedAt:new Date().toISOString(),before:structuredClone(beforeDoc),after:structuredClone(doc)};
 history.push(entry);return record;
}
