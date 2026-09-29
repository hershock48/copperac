import { createHash, randomUUID } from "node:crypto";

export type Query = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
export type Mail = { from: string; to: [string]; reply_to: string; subject: string; text: string };
export type SendResult = { kind: "accepted"; id: string } | { kind: "retry" | "blocked"; code: string; retryAfterMs?: number };
export type DeliveryResult = { kind: "checked"; event: string } | { kind: "unavailable"; code: string };
export type Meta = {
  version: 1; payload: string | null; key: string | null; credential: string | null;
  attempts: number; firstAttemptAt: number | null; lastAttemptAt: number | null;
  leaseId: string | null; leaseUntil: number | null; nextAttemptAt: number | null;
  providerId: string | null; providerEvent: string | null; checkedAt: number | null;
  errorCode: string | null; checkError: string | null; updatedAt: number;
  closedAction?: { id: string; revision: string; reason: string; at: number };
};
export type Notification = { orderId: string; status: string; createdAt: number; order: Record<string, unknown>; meta: Meta | null };
export type NotificationView = { orderId: string; number: number | null; recipient: string; status: string; revision: string; createdAt: number; attempts: number; nextAttemptAt: number | null; providerId: string | null; providerEvent: string | null; checkedAt: number | null; errorCode: string | null; checkError: string | null; closedReason: string | null };
export const MAX_SEND_AGE = 20 * 60_000;
export const MAX_KEY_AGE = 23 * 60 * 60_000; // Margin before the provider's 24-hour retention expires.
export const LEASE_MS = 60_000;
export const MAX_ATTEMPTS = 5;
export const NOTIFICATION_SCHEMA = `ALTER TABLE ordering_confirmations ADD COLUMN IF NOT EXISTS meta jsonb;
CREATE INDEX IF NOT EXISTS ordering_confirmations_queue ON ordering_confirmations(status,created_at);
CREATE TABLE IF NOT EXISTS ordering_notification_history(id text PRIMARY KEY,order_id text NOT NULL,created_at bigint NOT NULL,data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS ordering_notification_history_order ON ordering_notification_history(order_id,created_at);
CREATE TABLE IF NOT EXISTS ordering_notification_reviews(id text PRIMARY KEY,fingerprint text NOT NULL,data jsonb NOT NULL);`;
export const isNotificationId = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export const isProviderId = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(v: unknown): unknown {
  if(Array.isArray(v))return v.map(canonical);
  if(v && typeof v === "object")return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)]));
  return v;
}
export function notificationRevision(n: Notification): string { return digest(JSON.stringify(canonical({status:n.status,meta:n.meta}))); }
function metadata(now: number): Meta {
  return {version:1,payload:null,key:null,credential:null,attempts:0,firstAttemptAt:null,lastAttemptAt:null,leaseId:null,leaseUntil:null,nextAttemptAt:null,providerId:null,providerEvent:null,checkedAt:null,errorCode:null,checkError:null,updatedAt:now};
}
function record(r: Record<string,unknown>): Notification {
  return {orderId:String(r.order_id),status:String(r.status),createdAt:Number(r.created_at),order:r.data as Record<string,unknown>,meta:(r.meta as Meta|null)??null};
}
export async function readNotification(q: Query, id: string): Promise<Notification|null> {
  const rows=await q("SELECT * FROM ordering_confirmations WHERE order_id=$1",[id]);return rows.rows[0]?record(rows.rows[0]):null;
}
async function locked(q: Query,id: string): Promise<{notification:Notification|null; order:Record<string,unknown>|null}> {
  const orders=await q("SELECT data FROM ordering_orders WHERE id=$1 FOR UPDATE",[id]);
  const rows=await q("SELECT * FROM ordering_confirmations WHERE order_id=$1 FOR UPDATE",[id]);
  return {notification:rows.rows[0]?record(rows.rows[0]):null,order:(orders.rows[0]?.data as Record<string,unknown>)??null};
}
async function save(q:Query,before:Notification,status:string,meta:Meta,event:string,now:number,actor="system") {
  const after={status,meta:{...meta,updatedAt:now}};
  await q("UPDATE ordering_confirmations SET status=$2,meta=$3::jsonb WHERE order_id=$1",[before.orderId,status,JSON.stringify(after.meta)]);
  await q("INSERT INTO ordering_notification_history(id,order_id,created_at,data) VALUES($1,$2,$3,$4::jsonb)",[randomUUID(),before.orderId,now,JSON.stringify({event,actor,before:{status:before.status,meta:before.meta},after})]);
  return {...before,...after};
}
export function notificationView(n:Notification):NotificationView {
  const m=n.meta;
  return {orderId:n.orderId,number:Number.isSafeInteger(n.order.number)?Number(n.order.number):null,recipient:String(n.order.guestEmail??""),status:n.status,revision:notificationRevision(n),createdAt:n.createdAt,attempts:m?.attempts??0,nextAttemptAt:m?.nextAttemptAt??null,providerId:m?.providerId??null,providerEvent:m?.providerEvent??null,checkedAt:m?.checkedAt??null,errorCode:m?.errorCode??(n.status==="attempted"?"LEGACY_OUTCOME_UNKNOWN":null),checkError:m?.checkError??null,closedReason:m?.closedAction?.reason??null};
}
export async function notificationList(q:Query):Promise<{items:NotificationView[];count:number}> {
  const rows=await q("SELECT *,COUNT(*) OVER() AS total FROM ordering_confirmations WHERE status<>'closed' ORDER BY CASE WHEN status IN ('review','blocked','attempted') THEN 0 WHEN status IN ('queued','retry','sending') THEN 1 ELSE 2 END,created_at DESC,order_id LIMIT 30");
  return {items:rows.rows.map(r=>notificationView(record(r))),count:Number(rows.rows[0]?.total??0)};
}
export async function dueNotifications(q:Query,now=Date.now()):Promise<string[]> {
  const rows=await q("SELECT order_id FROM ordering_confirmations WHERE status IN ('queued','retry','sending','attempted') AND COALESCE((meta->>'leaseUntil')::bigint,0)<=$1 AND COALESCE((meta->>'nextAttemptAt')::bigint,0)<=$1 ORDER BY created_at,order_id LIMIT 2",[now]);
  return rows.rows.map(r=>String(r.order_id));
}
export async function dueDeliveryChecks(q:Query,now=Date.now()):Promise<string[]> {
  const rows=await q("SELECT order_id FROM ordering_confirmations WHERE meta->>'providerId' IS NOT NULL AND created_at>$1 AND COALESCE((meta->>'leaseUntil')::bigint,0)<=$2 AND COALESCE((meta->>'checkedAt')::bigint,0)<=$3 ORDER BY COALESCE((meta->>'checkedAt')::bigint,0),created_at LIMIT 2",[now-7*24*60*60_000,now,now-15*60_000]);
  return rows.rows.map(r=>String(r.order_id));
}
type Claim = { notification:Notification; lease:string };
export async function claimNotification(tx:Transaction,id:string,render:(order:Record<string,unknown>)=>Mail,credential:string,namespace:string,now=Date.now()):Promise<Claim|null> {
  if(!isNotificationId(id)||!/^[a-f0-9]{64}$/.test(credential)||!/^[a-z0-9-]{1,50}$/.test(namespace))throw Error("Invalid notification identity.");
  return tx(async q=>{
    const {notification:n,order}=await locked(q,id);if(!n)return null;
    const m=n.meta??metadata(now);
    if(m.leaseUntil!==null&&m.leaseUntil>now)return null;
    if(!["queued","retry","sending","attempted"].includes(n.status))return null;
    const stop=async(status:string,code:string)=>{await save(q,n,status,{...m,leaseId:null,leaseUntil:null,nextAttemptAt:null,errorCode:code},"dispatch_stopped",now);return null;};
    if(n.status==="attempted" || (n.status!=="queued"&&(!m.payload||!m.key||m.firstAttemptAt===null)))return stop("review","LEGACY_OUTCOME_UNKNOWN");
    if(!order||!["new","accepted"].includes(String(order.status)))return stop(m.firstAttemptAt===null?"suppressed":"review",m.firstAttemptAt===null?"ORDER_ALREADY_CLOSED":"ORDER_CLOSED_OUTCOME_UNKNOWN");
    if(n.createdAt>now||now-n.createdAt>=MAX_SEND_AGE)return stop(m.firstAttemptAt===null?"suppressed":"review",m.firstAttemptAt===null?"CONFIRMATION_TOO_OLD":"RETRY_WINDOW_CLOSED");
    if(m.firstAttemptAt!==null&&(now<m.firstAttemptAt||now-m.firstAttemptAt>=MAX_KEY_AGE))return stop("review","RETRY_KEY_EXPIRED");
    if(m.attempts>=MAX_ATTEMPTS)return stop("review","RETRY_LIMIT_REACHED");
    if(m.credential&&m.credential!==credential)return stop("review","PROVIDER_CREDENTIAL_CHANGED");
    if(m.nextAttemptAt!==null&&m.nextAttemptAt>now)return null;
    let payload=m.payload;
    if(!payload){
      try{
        const message=render(n.order);
        if(message.to.length!==1||message.to[0]!==n.order.guestEmail||!message.from||!message.subject||!message.text||JSON.stringify(message).length>65536)throw Error();
        payload=JSON.stringify(message);
      }catch{return stop("blocked","INVALID_MESSAGE_CONFIGURATION");}
    }
    const lease=randomUUID();
    const changed=await save(q,n,"sending",{...m,payload,key:m.key??"gw-confirmation/"+namespace+"/"+id,credential,attempts:m.attempts+1,firstAttemptAt:m.firstAttemptAt??now,lastAttemptAt:now,leaseId:lease,leaseUntil:now+LEASE_MS,nextAttemptAt:null,errorCode:null},"dispatch_claimed",now);
    return {notification:changed,lease};
  });
}
export async function finishNotification(tx:Transaction,claim:Claim,result:SendResult,now=Date.now()):Promise<Notification|null> {
  return tx(async q=>{
    const {notification:n}=await locked(q,claim.notification.orderId);if(!n||!n.meta)return n;
    const m=n.meta;
    if(result.kind==="accepted"&&isProviderId(result.id)&&m.key===claim.notification.meta?.key&&m.payload===claim.notification.meta?.payload){
      // A late positive acknowledgement is still evidence, even after the lease
      // expired or an owner took responsibility. A stale failure is not.
      if(m.providerId&&m.providerId!==result.id)return save(q,n,"review",{...m,errorCode:"CONFLICTING_PROVIDER_IDS"},"provider_conflict",now);
      if(m.providerId===result.id)return n;
      return save(q,n,m.closedAction?"closed":"accepted",{...m,providerId:result.id,leaseId:null,leaseUntil:null,nextAttemptAt:null,errorCode:null},"provider_accepted",now);
    }
    if(m.leaseId!==claim.lease)return n;
    const failure=result.kind==="accepted"?{kind:"retry" as const,code:"MISSING_PROVIDER_ID"}:result;
    const terminal=failure.kind==="blocked"||m.attempts>=MAX_ATTEMPTS||now-n.createdAt>=MAX_SEND_AGE;
    const status=failure.kind==="blocked"?"blocked":terminal?"review":"retry";
    return save(q,n,status,{...m,leaseId:null,leaseUntil:null,nextAttemptAt:terminal?null:now+Math.max(30_000*2**(m.attempts-1),Math.min(24*60*60_000,Math.max(0,failure.retryAfterMs??0))),errorCode:failure.code},"provider_attempt_result",now);
  });
}
export async function dispatchNotification(tx:Transaction,id:string,render:(order:Record<string,unknown>)=>Mail,credential:string,namespace:string,send:(payload:string,key:string)=>Promise<SendResult>,clock=Date.now):Promise<Notification|null> {
  const claim=await claimNotification(tx,id,render,credential,namespace,clock());if(!claim)return null;
  let result:SendResult;try{result=await send(claim.notification.meta!.payload!,claim.notification.meta!.key!);}catch{result={kind:"retry",code:"PROVIDER_RESPONSE_UNKNOWN"};}
  return finishNotification(tx,claim,result,clock());
}
export async function checkNotification(tx:Transaction,id:string,retrieve:(providerId:string,payload:string)=>Promise<DeliveryResult>,clock=Date.now):Promise<Notification|null> {
  if(!isNotificationId(id))throw Error("Invalid notification identity.");
  const claim=await tx(async q=>{
    const {notification:n}=await locked(q,id),now=clock();if(!n?.meta?.providerId||!n.meta.payload||(n.meta.leaseUntil??0)>now)return null;
    const lease=randomUUID(),changed={...n,meta:{...n.meta,leaseId:lease,leaseUntil:now+LEASE_MS}};
    await q("UPDATE ordering_confirmations SET meta=$2::jsonb WHERE order_id=$1",[id,JSON.stringify(changed.meta)]);return {notification:changed,lease};
  });if(!claim)return null;
  let result:DeliveryResult;try{result=await retrieve(claim.notification.meta!.providerId!,claim.notification.meta!.payload!);}catch{result={kind:"unavailable",code:"DELIVERY_CHECK_UNAVAILABLE"};}
  return tx(async q=>{
    const {notification:n}=await locked(q,id);if(!n?.meta||n.meta.leaseId!==claim.lease)return n;
    const next={...n.meta,leaseId:null,leaseUntil:null,checkedAt:clock(),providerEvent:result.kind==="checked"?result.event:n.meta.providerEvent,checkError:result.kind==="checked"?null:result.code};
    if(next.providerEvent===n.meta.providerEvent&&next.checkError===n.meta.checkError){await q("UPDATE ordering_confirmations SET meta=$2::jsonb WHERE order_id=$1",[id,JSON.stringify(next)]);return {...n,meta:next};}
    return save(q,n,n.status,next,"delivery_check_result",clock());
  });
}
export type CloseCommand={operationId:string;orderId:string;revision:string;reason:string};
export type CloseResult={operationId:string;orderId:string;command:CloseCommand;outcome:"saved"|"rejected";status:number;message:string};
export async function getNotificationReview(q:Query,id:string):Promise<CloseResult|null>{const result=await q("SELECT data FROM ordering_notification_reviews WHERE id=$1",[id]);return (result.rows[0]?.data as CloseResult)??null;}
export function parseCloseCommand(raw:unknown):CloseCommand|null {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;const v=raw as Record<string,unknown>;
  if(Object.keys(v).sort().join(",")!=="operationId,orderId,reason,revision"||!isNotificationId(v.operationId)||!isNotificationId(v.orderId)||typeof v.revision!=="string"||!/^[a-f0-9]{64}$/.test(v.revision)||typeof v.reason!=="string"||!v.reason.trim()||v.reason.length>240||/[\x00-\x1f\x7f]/.test(v.reason))return null;
  return v as CloseCommand;
}
export function closeNotification(tx:Transaction,command:CloseCommand,now=Date.now()):Promise<CloseResult> {
  if(!parseCloseCommand(command))return Promise.reject(Error("Invalid notification review."));
  return tx(async q=>{
    const fingerprint=digest(JSON.stringify(canonical(command))),base={operationId:command.operationId,orderId:command.orderId,command};
    const reserved=await q("INSERT INTO ordering_notification_reviews(id,fingerprint,data) VALUES($1,$2,'{}'::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id",[command.operationId,fingerprint]);
    if(!reserved.rows.length){const old=await q("SELECT fingerprint,data FROM ordering_notification_reviews WHERE id=$1",[command.operationId]);return old.rows[0]?.fingerprint===fingerprint?old.rows[0].data as CloseResult:{...base,outcome:"rejected",status:409,message:"This reference belongs to another review."};}
    const finish=async(result:CloseResult)=>{await q("UPDATE ordering_notification_reviews SET data=$2::jsonb WHERE id=$1",[command.operationId,JSON.stringify(result)]);return result;};
    const reject=(status:number,message:string)=>finish({...base,outcome:"rejected",status,message});
    const {notification:n}=await locked(q,command.orderId);
    if(!n)return reject(404,"This confirmation was not found.");
    const previous=n.meta?.closedAction;
    if(previous?.id===command.operationId){
      if(previous.reason!==command.reason||previous.revision!==command.revision)return reject(409,"This reference belongs to another review.");
      return finish({...base,outcome:"saved",status:200,message:"Manual follow-up responsibility recorded. This does not claim email delivery."});
    }
    if(n.status==="closed"||notificationRevision(n)!==command.revision)return reject(409,"This confirmation changed. Refresh before reviewing it.");
    if((n.meta?.leaseUntil??0)>now)return reject(409,"A provider request is in progress. Check its result before closing this issue.");
    await save(q,n,"closed",{...(n.meta??metadata(now)),leaseId:null,leaseUntil:null,nextAttemptAt:null,closedAction:{id:command.operationId,revision:command.revision,reason:command.reason,at:now}},"manual_followup",now,"owner");
    return finish({...base,outcome:"saved",status:200,message:"Manual follow-up responsibility recorded. This does not claim email delivery."});
  });
}
