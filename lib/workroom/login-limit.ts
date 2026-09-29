import 'server-only';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {connectionVar,workroomDatabase} from './store';
const WINDOW=10*60*1000,LIMIT=5;
const local=globalThis as typeof globalThis & {__copperClientLogins?:Map<string,{started:number;count:number}>};

/** Only deployment-controlled proxy headers are identities. Never trust an
 * arbitrary forwarded header on a direct/self-hosted Node server. Vercel
 * overwrites x-vercel-forwarded-for at its edge. Other hosts must explicitly
 * configure an overwriting trusted proxy and WORKROOM_TRUSTED_IP_HEADER. */
export function loginClient(req:Request):string {
 const configured=process.env.WORKROOM_TRUSTED_IP_HEADER;
 const header=process.env.VERCEL==='1'?'x-vercel-forwarded-for':configured;
 if(header&&!['x-vercel-forwarded-for','x-forwarded-for','x-real-ip'].includes(header))throw Error('Invalid trusted client-address configuration.');
 if(!header){
  if(process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1','[::1]'].includes(new URL(req.url).hostname))return 'local-loopback';
  throw Error('Trusted client address unavailable.');
 }
 const raw=req.headers.get(header)?.trim()??'';
 if(!isIP(raw))throw Error('Trusted client address unavailable.');
 const canonical=isIP(raw)===6?new URL('http://['+raw+']/').hostname:raw;
 return createHash('sha256').update(canonical).digest('hex');
}

export async function allowLogin(client:string,now=Date.now(),role:'owner'|'kitchen'='owner'){
 if(!client)throw Error('Client identity required.');const key=role+':'+client;
 if(!connectionVar()){
  if(process.env.NODE_ENV==='production')throw Error('Persistent login storage unavailable.');
  const buckets=local.__copperClientLogins??=new Map();for(const [id,bucket]of buckets)if(now-bucket.started>=WINDOW)buckets.delete(id);
  if(!buckets.has(key)&&buckets.size>=4096)throw Error('Local sign-in capacity reached.');
  const prior=buckets.get(key),bucket=prior&&now>=prior.started&&now-prior.started<WINDOW?prior:{started:now,count:0};
  bucket.count=Math.min(bucket.count,LIMIT)+1;buckets.set(key,bucket);return bucket.count<=LIMIT;
 }
 const db=await workroomDatabase();await db.query('DELETE FROM copper_login_attempts WHERE started<=$1',[now-WINDOW]);
 const result=await db.query(`INSERT INTO copper_login_attempts(id,attempts,started) VALUES($1,1,$2)
 ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN copper_login_attempts.started<=$3 THEN 1 ELSE LEAST(copper_login_attempts.attempts,5)+1 END,
 started=CASE WHEN copper_login_attempts.started<=$3 THEN $2 ELSE copper_login_attempts.started END RETURNING attempts`,[key,now,now-WINDOW]);return Number(result.rows[0].attempts)<=LIMIT;
}
export async function clearLoginAttempts(client:string){
 if(!client)throw Error('Client identity required.');const key='owner:'+client;
 if(!connectionVar()){if(process.env.NODE_ENV==='production')throw Error('Persistent login storage unavailable.');local.__copperClientLogins?.delete(key);return;}
 await(await workroomDatabase()).query('DELETE FROM copper_login_attempts WHERE id=$1',[key]);
}
