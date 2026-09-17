const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../..');
function load(file,mocks={},env={}){
 const mod={exports:{}};const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new vm.Script(source,{filename:file}).runInNewContext({module:mod,exports:mod.exports,process:{env},Buffer,structuredClone,Request,Response,URL,AbortSignal,crypto:crypto.webcrypto,console,require(name){if(Object.hasOwn(mocks,name))return mocks[name];if(name==='./notification-outbox')return load('lib/ordering/notification-outbox.ts');if(name==='./printer-jobs')return load('lib/ordering/printer-jobs.ts');if(name==='./menu-document-fields')return load('lib/ordering/menu-document-fields.ts');if(name==='./menu-document-store')return load('lib/ordering/menu-document-store.ts');if(name==='../workroom/content-cas')return load('lib/workroom/content-cas.ts');if(name==='node:crypto')return crypto;throw Error('Unexpected dependency '+name);}});return mod.exports;
}
const kitchen=load('lib/ordering/kitchen-operations.ts');
const core=load('lib/ordering/order-acceptance.ts'),quotes=load('lib/ordering/order-quote.ts'),pricing=load('lib/ordering/pricing.ts');
const clone=x=>JSON.parse(JSON.stringify(x));
const http={NextResponse:{json:Response.json}};
const request=(body,url='https://fixture.invalid/api/ordering/order')=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const readRequest=id=>({nextUrl:new URL('https://fixture.invalid/api/ordering/attempt?id='+id)});
const line=()=>({itemId:'burger',qty:1,options:[],quotedUnitCents:1000,quotedAgeRestricted:false});
const totals=()=>quotes.orderTotals(1000,99,0,600);
const payload=(patch={})=>({attemptId:crypto.randomUUID(),guestName:'Fixture',guestPhone:'2025550123',guestEmail:'fixture@example.invalid',note:'Keep me',tipCents:0,ageAcknowledged:false,payAtPickup:false,lines:[line()],expectedTotals:totals(),...patch});
function harness(){
 const bag={attempts:new Map(),orders:new Map(),printJobs:[],confirmations:new Map()},calls={menu:0,email:0,tickets:0};let menuGate=null;
 const store={backend:'postgres',getAttempt:async id=>bag.attempts.get(id)??null,settleAttempt:async(a,o,j)=>core.settleMemory(bag,a,o,j),getState:async()=>({pausedUntil:null,unavailable:[],busyMinutes:0}),nextTicketNumber:async()=>++calls.tickets,getOrder:async id=>bag.orders.get(id),claimConfirmation:async id=>{const c=bag.confirmations.get(id);if(c?.status!=='queued')return false;c.status='attempted';return true;}};
 const menu={guestMenu:async()=>{calls.menu++;if(menuGate)await menuGate;return {index:new Map([['burger',{id:'burger',name:'Burger',priceCents:1000,ageRestricted:false,options:[]}]])};}};
 const time={orderingWindow:()=>({open:true})};
 const mocks={'next/server':http,'@/lib/ordering/order-acceptance':core,'@/lib/ordering/order-quote':quotes,'@/lib/ordering/pricing':pricing,'@/lib/ordering/menu':menu,'@/lib/ordering/store':{getStore:()=>store,effectiveState:s=>s},'@/lib/ordering/config':{ORDERING:{feeCents:99,taxBasisPoints:600,basePickupMinutes:15}},'@/lib/ordering/time':time,'@/lib/ordering/printing':{configuredPrinters:()=>[{id:'kitchen',role:'kitchen'}],renderFor:(_r,o)=>'Ticket '+o.number},'@/lib/ordering/email':{sendOrderConfirmation:async()=>calls.email++}};
 const route=load('app/api/ordering/order/route.ts',mocks,{NODE_ENV:'production'}),attempt=load('app/api/ordering/attempt/route.ts',mocks,{NODE_ENV:'production'});
 return {bag,calls,store,menu,time,mocks,route,attempt,post:b=>route.POST(request(b)),gate(p){menuGate=p;}};
}
test('simultaneous identical submissions settle one order, print job and mail intent; replay survives closed or changed menus',async()=>{
 const h=harness(),body=payload();const responses=await Promise.all([h.post(body),h.post(body)]);const receipts=await Promise.all(responses.map(r=>r.json()));
 assert.equal(responses[0].status,200);assert.deepEqual(receipts[0],receipts[1]);assert.equal(h.bag.orders.size,1);assert.equal(h.bag.printJobs.length,1);assert.equal(h.bag.confirmations.size,1);assert.equal(h.calls.email,1);
 const reads=h.calls.menu;h.time.orderingWindow=()=>({open:false,reason:'Closed'});h.menu.guestMenu=async()=>{throw Error('Offline menu');};
 assert.deepEqual(await (await h.post(body)).json(),receipts[0]);assert.equal(h.calls.menu,reads);assert.equal(h.calls.email,1);
 const conflict=await h.post({...body,note:'Changed details'});assert.equal(conflict.status,409);assert.equal((await conflict.json()).outcome,'conflict');assert.equal(h.bag.orders.size,1);
});
test('rejected quotes stay rejected on retry and need a new reference for reviewed changes',async()=>{
 const h=harness(),body=payload({lines:[{...line(),quotedUnitCents:900}]});
 const result=await h.post(body),rejected=await result.json();assert.equal(result.status,409);assert.equal(rejected.outcome,'rejected');assert.equal(h.bag.orders.size,0);assert.equal(h.bag.printJobs.length,0);
 assert.deepEqual(await (await h.post(body)).json(),rejected);assert.equal((await h.post({...body,lines:[line()]})).status,409);
 assert.equal((await h.post({...body,attemptId:crypto.randomUUID(),lines:[line()]})).status,200);assert.equal(h.bag.orders.size,1);
});
test('stop fences a delayed request; stopping an accepted order returns its receipt and cannot cancel it',async()=>{
 const h=harness(),body=payload();let release;h.gate(new Promise(r=>release=r));
 const pending=h.post(body);
 while(h.calls.menu===0)await new Promise(r=>setImmediate(r));
 const stopped=await h.attempt.POST(request({attemptId:body.attemptId}));assert.equal((await stopped.json()).outcome,'cancelled');release();
 assert.equal((await (await pending).json()).outcome,'cancelled');assert.equal(h.bag.orders.size,0);assert.equal(h.bag.printJobs.length,0);
 assert.equal((await (await h.post(body)).json()).outcome,'cancelled');
 h.gate(null);const second=payload();const receipt=await (await h.post(second)).json();const stopAccepted=await (await h.attempt.POST(request({attemptId:second.attemptId}))).json();assert.deepEqual(stopAccepted,receipt);assert.equal(h.bag.orders.get(second.attemptId).status,'new');
 const unknown=await h.attempt.GET(readRequest(crypto.randomUUID()));assert.equal(unknown.status,202);assert.equal((await unknown.json()).outcome,'unknown');
});
test('failure after commit is recoverable by reference; mail failure cannot produce another order',async()=>{
 const h=harness(),body=payload();const settle=h.store.settleAttempt;let first=true;
 h.store.settleAttempt=async(...args)=>{const r=await settle(...args);if(first){first=false;throw Error('Connection lost after commit');}return r;};
 assert.equal((await h.post(body)).status,503);assert.equal(h.bag.orders.size,1);assert.equal(h.bag.confirmations.get(body.attemptId).status,'queued');
 const recovered=await (await h.attempt.GET(readRequest(body.attemptId))).json();assert.equal(recovered.outcome,'accepted');assert.equal(recovered.id,body.attemptId);
 assert.deepEqual(await (await h.post(body)).json(),recovered);assert.equal(h.bag.printJobs.length,1);assert.equal(h.calls.email,0);
 const fresh=harness();fresh.mocks['@/lib/ordering/email'].sendOrderConfirmation=async()=>{throw Error('No mail');};const another=payload();assert.equal((await fresh.post(another)).status,200);assert.equal(fresh.bag.confirmations.get(another.attemptId).status,'queued');assert.equal((await fresh.post(another)).status,200);
});
test('bounded JSON, invalid references, excessive nesting and production memory cannot create attempts',async()=>{
 assert.equal(await core.readAttemptBody(new Request('https://fixture.invalid',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})),null);
 assert.equal(await core.readAttemptBody(request({note:'x'.repeat(65537)})),null);
 let deep={};for(let i=0;i<20;i++)deep={deep};assert.throws(()=>core.requestFingerprint(deep));
 assert.equal(core.requestFingerprint({b:2,a:{d:4,c:3}}),core.requestFingerprint({a:{c:3,d:4},b:2}));
 const h=harness();assert.equal((await h.post(payload({attemptId:'123'}))).status,400);assert.equal(h.bag.attempts.size,0);
 h.store.backend='memory';assert.equal((await h.post(payload())).status,503);assert.equal((await h.attempt.POST(request({attemptId:crypto.randomUUID()}))).status,503);assert.equal(h.bag.attempts.size,0);
});
const schema=`CREATE TABLE ordering_orders(id text PRIMARY KEY,status text NOT NULL,created_at bigint NOT NULL,data jsonb NOT NULL);CREATE TABLE ordering_print_jobs(id text PRIMARY KEY,printer_id text NOT NULL,order_id text NOT NULL,body text NOT NULL CHECK(body <> 'fail'),status text NOT NULL,created_at bigint NOT NULL);`+core.ATTEMPT_SCHEMA;
function settlement(email='fixture@example.invalid'){
 const id=crypto.randomUUID(),createdAt=1800000000000,order={id,number:1,status:'new',createdAt,guestEmail:email,lines:[line()]};
 return {attempt:{id,fingerprint:'a'.repeat(64),createdAt,outcome:'accepted',status:200,response:{attemptId:id,outcome:'accepted'}},order,jobs:[{id:crypto.randomUUID(),orderId:id,printerId:'kitchen',body:'Ticket 1',status:'queued',createdAt}]};
}
test('PostgreSQL order, attempt, print and email intent commit together; either fanout failure rolls everything back',async()=>{
 const db=new PGlite();await db.waitReady;await db.exec(schema);const query=(sql,p)=>db.query(sql,p);
 try{
  const x=settlement();await assert.rejects(core.settlePostgres(query,x.attempt,x.order,[{...x.jobs[0],body:'fail'}]));
  for(const table of ['ordering_attempts','ordering_orders','ordering_print_jobs','ordering_confirmations'])assert.equal((await db.query('SELECT COUNT(*) AS n FROM '+table)).rows[0].n,0);
  await db.exec("ALTER TABLE ordering_confirmations ADD CONSTRAINT mail_failure CHECK (data->>'guestEmail' <> 'fail')");
  const badMail=settlement('fail');await assert.rejects(core.settlePostgres(query,badMail.attempt,badMail.order,badMail.jobs));
  for(const table of ['ordering_attempts','ordering_orders','ordering_print_jobs','ordering_confirmations'])assert.equal((await db.query('SELECT COUNT(*) AS n FROM '+table)).rows[0].n,0);
  const outcomes=await Promise.all([core.settlePostgres(query,x.attempt,x.order,x.jobs),core.settlePostgres(query,x.attempt,x.order,x.jobs)]);assert.deepEqual(outcomes.map(o=>o.created).sort(),[false,true]);
  for(const table of ['ordering_attempts','ordering_orders','ordering_print_jobs','ordering_confirmations'])assert.equal((await db.query('SELECT COUNT(*) AS n FROM '+table)).rows[0].n,1);
  const blocked={id:x.order.id,fingerprint:null,createdAt:x.order.createdAt,outcome:'cancelled',status:409,response:{attemptId:x.order.id,outcome:'cancelled'}};
  assert.equal((await core.settlePostgres(query,blocked)).attempt.outcome,'accepted');
 }finally{await db.close();}
});
test('committed keys, receipts and queued intents survive a local database close/reopen',async()=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'glazed-order-restart-'));let db=new PGlite(dir);const x=settlement();
 try{await db.waitReady;await db.exec(schema);await core.settlePostgres((s,p)=>db.query(s,p),x.attempt,x.order,x.jobs);await db.close();db=new PGlite(dir);await db.waitReady;
  const fresh=load('lib/ordering/order-acceptance.ts');const recovered=await fresh.settlePostgres((s,p)=>db.query(s,p),x.attempt,x.order,x.jobs);assert.equal(recovered.created,false);assert.deepEqual(clone(recovered.attempt),x.attempt);
  assert.equal((await db.query('SELECT status FROM ordering_confirmations')).rows[0].status,'queued');assert.equal((await db.query('SELECT COUNT(*) AS n FROM ordering_print_jobs')).rows[0].n,1);
 }finally{await db.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('glazed-order-restart-'));await fsp.rm(dir,{recursive:true,force:true});}
});
test('ordering storage shares initialization, propagates failures and does not disable TLS verification',async()=>{
 const env={NODE_ENV:'production',DATABASE_URL:'postgres://fixture.invalid/test'};let created=0,ended=0,fail=true;
 class Pool{constructor(options){created++;assert.equal(options.ssl,undefined);assert.equal(options.connectionTimeoutMillis,7000);}async query(sql){if(sql.includes('CREATE TABLE')){if(fail)throw Error('schema offline');return {rows:[]};}return {rows:[]};}async end(){ended++;}}
 const store=load('lib/ordering/store.ts',{'./order-acceptance':core,'./kitchen-operations':kitchen,pg:{Pool}},env).getStore();
 const failed=await Promise.allSettled([store.getState(),store.getState()]);assert(failed.every(r=>r.status==='rejected'));assert.equal(created,1);assert.equal(ended,1);
 fail=false;await Promise.all([store.getState(),store.getState()]);assert.equal(created,2);
 const ambiguous=load('lib/ordering/store.ts',{'./order-acceptance':core,'./kitchen-operations':kitchen},{NODE_ENV:'production',A_DATABASE_URL:'postgres://a',B_POSTGRES_URL:'postgres://b'});assert.throws(()=>ambiguous.getStore());
 const memory=load('lib/ordering/store.ts',{'./order-acceptance':core,'./kitchen-operations':kitchen},{NODE_ENV:'production'}).getStore();const x=settlement();await assert.rejects(memory.settleAttempt(x.attempt,x.order,x.jobs));await assert.rejects(memory.commitKitchen(kitchen.rejected(crypto.randomUUID(),'b'.repeat(64),'state','staff','fixture'),null));
});
test('client recovery keeps unknown/mismatched replies unresolved and retries one immutable request only',async()=>{
 const client=load('lib/ordering/order-recovery.ts',{'./order-quote':quotes});const h=harness(),body=payload(),submission={id:body.attemptId,body:JSON.stringify(body)};
 const receipt=await (await h.post(body)).json();assert.equal(client.readRecovery(receipt,submission).kind,'accepted');assert.equal(client.readRecovery(receipt,{...submission,body:null}).kind,'accepted');
 for(const bad of [{...receipt,attemptId:crypto.randomUUID()},{...receipt,number:0},{...receipt,quote:null},{...receipt,totals:{...receipt.totals,totalCents:1}},{attemptId:submission.id,outcome:'unknown'},{attemptId:submission.id,outcome:'conflict'},null])assert.equal(client.readRecovery(bad,submission).kind,'unknown');
 assert.equal(client.readRecovery({attemptId:submission.id,outcome:'cancelled'},submission).kind,'cancelled');
 const calls=[];const offline=async(url,options)=>{calls.push([url,options.body]);throw Error('Network interrupted');};
 assert.equal((await client.recoverSubmission(submission,'submit',offline)).kind,'unknown');assert.equal(calls.length,1);assert.equal(calls[0][1],submission.body);
 const replay=async(url,options)=>{assert.equal(options.body,submission.body);return h.post(JSON.parse(options.body));};assert.equal((await client.recoverSubmission(submission,'submit',replay)).kind,'accepted');assert.equal(h.bag.orders.size,1);
});
