const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../..'),app=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name,prefix=app==='copperac'?'copper':'mikes';
const now=1_800_000_000_000,clean=x=>JSON.parse(JSON.stringify(x));
function load(file,mocks={},env={},globals={}){
 const module={exports:{}};
 class ClockDate extends Date {static now(){return now;}}
 new vm.Script(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{filename:file}).runInNewContext({module,exports:module.exports,Buffer,Request,Response,URL,structuredClone,Date:ClockDate,process:{env},setTimeout,clearTimeout,AbortController,console,...globals,require(name){if(Object.hasOwn(mocks,name))return mocks[name];if(name==='./menu-document-fields')return load('lib/ordering/menu-document-fields.ts');if(name==='./menu-document-store')return load('lib/ordering/menu-document-store.ts');if(name==='../workroom/content-cas')return load('lib/workroom/content-cas.ts');if(name==='server-only')return {};if(name==='node:crypto')return crypto;throw Error('Unexpected dependency '+name);}});
 return module.exports;
}
const core=load('lib/ordering/kitchen-operations.ts'),client=load('lib/ordering/kitchen-request.ts'),acceptance=load('lib/ordering/order-acceptance.ts');
const id=()=>crypto.randomUUID();
const board=(raw=null,change={busyMinutes:15},operationId=id())=>({operationId,kind:'state',revision:core.revisionOf(raw),change});
const order=(patch={})=>({id:id(),number:1,status:'new',createdAt:now,acceptedAt:null,paid:false,guestName:'Fixture guest',guestPhone:'2025550123',guestEmail:'',lines:[],totalCents:1000,...patch});
const move=(raw,status,patch={})=>({operationId:id(),kind:'order',revision:core.revisionOf(raw),orderId:raw.id,status,...patch});
const prepare=(command,raw,actor='owner')=>core.prepare(command,raw,actor,core.revisionOf(command),now);
const request=body=>new Request('https://fixture.invalid/api/kitchen/'+(body.kind==='state'?'state':'orders'),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function memory(env={NODE_ENV:'development'}){
 const bag={attempts:new Map(),confirmations:new Map(),orders:new Map(),state:null,operations:new Map(),ticket:0,printJobs:[],printersSeen:{},menuDoc:null};
 const store=load('lib/ordering/store.ts',{'./kitchen-operations':core,'./order-acceptance':acceptance},env,{['__'+prefix+'Ordering']:bag}).getStore();
 return {store,bag};
}
const ddl=`CREATE TABLE ordering_state(id int PRIMARY KEY,data jsonb NOT NULL);CREATE TABLE ordering_orders(id text PRIMARY KEY,status text NOT NULL,created_at bigint NOT NULL,data jsonb NOT NULL);CREATE TABLE ordering_print_jobs(id text PRIMARY KEY,order_id text NOT NULL,status text NOT NULL);`+core.OPERATION_SCHEMA;
async function sqlFixture(dir){const db=new PGlite(dir);await db.exec(ddl);return db;}
const commit=(db,prepared)=>core.commitOperation((s,p)=>db.query(s,p),prepared.receipt,prepared.candidate);

test('commands reject toggles, coerced numbers, extra fields, invalid revisions and incomplete cancellation',()=>{
 for(const change of [{toggle86:'x'},{busyMinutes:'15'},{busyMinutes:1},{pauseMinutes:-1},{pauseMinutes:30,busyMinutes:15},{itemId:'x',unavailable:'yes'},null])assert.equal(core.parseCommand(board(null,change),'state'),null);
 const b=board();assert.deepEqual(clean(core.parseCommand(b,'state')),b);
 for(const patch of [{revision:''},{operationId:'invalid'},{kind:'order'},{extra:true}])assert.equal(core.parseCommand({...b,...patch},'state'),null);
 const o=order();for(const c of [move(o,'refunded'),move(o,'done',{reason:'unexpected'}),move(o,'cancelled'),move(o,'cancelled',{reason:' '})])assert.equal(core.parseCommand(c,'order'),null);
 assert(core.parseCommand(move(o,'cancelled',{reason:'Guest requested cancellation'}),'order'));
});

test('memory saves do not leak mutable references, retain receipts and reject stale concurrent board changes',async()=>{
 const {store,bag}=memory(),a=board(),b=board(null,{itemId:'fixture',unavailable:true});
 const pa=prepare(a,null,'staff'),pb=prepare(b,null,'staff');
 const results=await Promise.all([store.commitKitchen(pa.receipt,pa.candidate),store.commitKitchen(pb.receipt,pb.candidate)]);
 assert.deepEqual(results.map(r=>r.httpStatus),[200,409]);assert.equal(bag.operations.size,2);
 const saved=await store.getStateRecord();saved.busyMinutes=0;assert.equal((await store.getStateRecord()).busyMinutes,15);
 assert.equal((await store.commitKitchen(pa.receipt,pa.candidate)).httpStatus,200);assert.equal(bag.operations.size,2);
 const result=await store.getOperation(a.operationId);result.after.busyMinutes=30;assert.equal((await store.getOperation(a.operationId)).after.busyMinutes,15);
 const current=await store.getStateRecord(),c=board(current,{itemId:'fixture',unavailable:true}),pc=prepare(c,current);
 assert.equal((await store.commitKitchen(pc.receipt,pc.candidate)).httpStatus,200);assert.equal((await store.getStateRecord()).busyMinutes,15);
});

test('state pauses expire on reads; each write has a unique revision even when values return to their starting values',async()=>{
 const {store}=memory();const a=prepare(board(null,{pauseMinutes:30}),null);
 await store.commitKitchen(a.receipt,a.candidate);const raw=await store.getStateRecord();
 assert.equal(core.boardView(raw,now+1800000).pausedUntil,null);assert.equal(raw.pausedUntil,now+1800000);
 const b=prepare(board(raw,{pauseMinutes:0}),raw);await store.commitKitchen(b.receipt,b.candidate);
 assert.notEqual(core.boardView(await store.getStateRecord()).revision,core.boardView(null).revision);
});

test('order transitions refuse skips, reopening, staff cancellation and printer completion without changing payment',async()=>{
 const o=order({paid:true});
 assert.equal(prepare(move(o,'done'),o).receipt.httpStatus,409);
 assert.equal(prepare(move(o,'cancelled',{reason:'Guest request'}),o,'staff').receipt.httpStatus,403);
 const accepted=prepare(move(o,'accepted'),o,'staff');assert.equal(accepted.receipt.httpStatus,200);assert.equal(accepted.candidate.after.acceptedAt,now);
 const done=prepare(move(accepted.candidate.after,'done'),accepted.candidate.after,'staff');assert.equal(done.receipt.httpStatus,200);
 assert.equal(prepare(move(done.candidate.after,'accepted'),done.candidate.after).receipt.httpStatus,409);
 assert.equal(prepare(move(accepted.candidate.after,'done'),accepted.candidate.after,'printer').receipt.httpStatus,403);
 const cancel=prepare(move(o,'cancelled',{reason:'Guest request'}),o);assert.equal(cancel.candidate.after.paid,true);assert.equal(cancel.candidate.after.totalCents,1000);
 assert.equal(prepare(move(cancel.candidate.after,'accepted'),cancel.candidate.after,'printer').receipt.httpStatus,409);
});

test('SQL reserves one durable result for concurrent duplicate actions and records conflicts without losing another change',async()=>{
 const db=await sqlFixture();try{
  const command=board(),a=prepare(command,null,'staff');const results=await Promise.all([commit(db,a),commit(db,a)]);
  assert.equal(results[0].httpStatus,200);assert.deepEqual(clean(results[0]),clean(results[1]));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ordering_operations')).rows[0].n,1);
  const stale=prepare(board(null,{itemId:'fixture',unavailable:true}),null);assert.equal((await commit(db,stale)).httpStatus,409);
  const current=(await db.query('SELECT data FROM ordering_state')).rows[0].data;
  const next=prepare(board(current,{itemId:'fixture',unavailable:true}),current);assert.equal((await commit(db,next)).httpStatus,200);
  const final=(await db.query('SELECT data FROM ordering_state')).rows[0].data;assert.equal(final.busyMinutes,15);assert.deepEqual(final.unavailable,['fixture']);
  const recorded=(await core.getReceipt((s,p)=>db.query(s,p),next.receipt.id));assert.deepEqual(recorded.before,current);assert.deepEqual(recorded.after,final);
 }finally{await db.close();}
});

test('SQL cancellation, queued-print suppression and audit receipt commit or roll back together; late acceptance cannot reopen it',async()=>{
 const db=await sqlFixture();try{
  const o=order({paid:true});await db.query('INSERT INTO ordering_orders VALUES($1,$2,$3,$4)',[o.id,o.status,o.createdAt,JSON.stringify(o)]);
  await db.query("INSERT INTO ordering_print_jobs VALUES('fixture-print',$1,'queued')",[o.id]);
  const cancel=prepare(move(o,'cancelled',{reason:'Owner called guest'}),o),late=prepare(move(o,'accepted'),o,'printer');
  await db.exec("CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture receipt unavailable'; END; $$; CREATE TRIGGER fail_receipt BEFORE INSERT ON ordering_operations FOR EACH ROW EXECUTE FUNCTION fail_receipt();");
  await assert.rejects(commit(db,cancel));assert.equal((await db.query('SELECT status FROM ordering_orders')).rows[0].status,'new');assert.equal((await db.query('SELECT status FROM ordering_print_jobs')).rows[0].status,'queued');
  await db.exec('DROP TRIGGER fail_receipt ON ordering_operations;');
  assert.equal((await commit(db,cancel)).httpStatus,200);assert.equal((await db.query('SELECT status FROM ordering_print_jobs')).rows[0].status,'failed');
  assert.equal((await commit(db,late)).httpStatus,409);const result=(await db.query('SELECT data FROM ordering_orders')).rows[0].data;
  assert.equal(result.status,'cancelled');assert.equal(result.paid,true);assert.equal(result.totalCents,o.totalCents);
 }finally{await db.close();}
});

test('a concurrent reused reference on different records rolls back the losing mutation instead of silently committing it',async()=>{
 const db=await sqlFixture();try{
  const o=order(),key=id();await db.query('INSERT INTO ordering_orders VALUES($1,$2,$3,$4)',[o.id,o.status,o.createdAt,JSON.stringify(o)]);
  const a=prepare(board(null,{busyMinutes:15},key),null),b=prepare(move(o,'accepted',{operationId:key}),o);
  const outcomes=await Promise.all([commit(db,a),commit(db,b)]);assert.equal(outcomes.filter(r=>r.httpStatus===200).length,1);
  const receipt=(await db.query('SELECT data FROM ordering_operations')).rows[0].data;
  const state=(await db.query('SELECT data FROM ordering_state')).rows[0]?.data,stored=(await db.query('SELECT data FROM ordering_orders')).rows[0].data;
  if(receipt.kind==='state'){assert.equal(state.busyMinutes,15);assert.equal(stored.status,'new');}else{assert.equal(state,undefined);assert.equal(stored.status,'accepted');}
 }finally{await db.close();}
});

test('receipt replay survives later changes and database close/reopen, including immutable rejected results',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kitchen-operations-'));let db=await sqlFixture(dir);
 try{
  const action=prepare(board(),null);await commit(db,action);
  const raw=(await db.query('SELECT data FROM ordering_state')).rows[0].data;await commit(db,prepare(board(raw,{busyMinutes:30}),raw));
  const bad=prepare(board(null,{pauseMinutes:30}),null);assert.equal((await commit(db,bad)).httpStatus,409);
  await db.close();db=new PGlite(dir);
  assert.deepEqual(clean(await commit(db,action)),clean(action.receipt));assert.equal((await commit(db,bad)).httpStatus,409);
  assert.equal((await db.query('SELECT data FROM ordering_state')).rows[0].data.busyMinutes,30);
 }finally{await db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

function service(actor='owner',env={NODE_ENV:'development'}){
 const {store,bag}=memory(env),mocks={'next/server':{NextResponse:{json:Response.json}},'./auth':{kitchenRole:async()=>actor},'./store':{getStore:()=>store},'./menu':{buildIndex:()=>new Map([['fixture',{}]]),loadMenuDoc:async()=>[],toOrderable:x=>x},'./kitchen-operations':core};
 return {store,bag,api:load('lib/ordering/kitchen-service.ts',mocks,env)};
}

test('actual kitchen service records invalid/stale results, rejects unauthorized and volatile production writes, and replays lost responses',async()=>{
 const f=service(),cmd=board();const initial=await f.api.runKitchenAction(request(cmd),'state');assert.equal(initial.status,200);
 const first=await initial.json();assert.equal(first.operationId,cmd.operationId);assert.equal(first.state.busyMinutes,15);
 const next=board(await f.store.getStateRecord(),{busyMinutes:30});assert.equal((await f.api.runKitchenAction(request(next),'state')).status,200);
 const recovered=await f.api.runKitchenAction(request(cmd),'state');assert.deepEqual(await recovered.json(),first);assert.equal((await f.store.getStateRecord()).busyMinutes,30);
 const invalid={...board(),change:{toggle86:'fixture'}};assert.equal((await f.api.runKitchenAction(request(invalid),'state')).status,400);assert(f.bag.operations.has(invalid.operationId));
 assert.equal((await f.api.runKitchenAction(request({...cmd,change:{busyMinutes:0}}),'state')).status,409);
 const unauthorized=service(null);assert.equal((await unauthorized.api.runKitchenAction({body:null},'state')).status,401);assert.equal(unauthorized.bag.operations.size,0);
 const volatile=service('owner',{NODE_ENV:'production'});assert.equal((await volatile.api.runKitchenAction({body:null},'state')).status,503);assert.equal(volatile.bag.operations.size,0);
});

test('owner cancellation from the actual service retains money, cancels queued prints and never invokes an email provider',async()=>{
 const f=service(),o=order({paid:true});f.bag.orders.set(o.id,o);f.bag.printJobs.push({id:'fixture',orderId:o.id,status:'queued'});
 const command=move(o,'cancelled',{reason:'Guest called'});const response=await f.api.runKitchenAction(request(command),'order');assert.equal(response.status,200);
 assert.equal(f.bag.orders.get(o.id).paid,true);assert.equal(f.bag.orders.get(o.id).status,'cancelled');assert.equal(f.bag.printJobs[0].status,'failed');
 assert.equal((await f.store.listActiveOrders()).length,0);assert.equal(f.bag.operations.size,1);
 const staff=service('staff');staff.bag.orders.set(o.id,o);assert.equal((await staff.api.runKitchenAction(request(command),'order')).status,403);assert.equal(staff.bag.orders.get(o.id).status,'new');
});

test('client validates correlated results, retains uncertain requests and retries exactly the same body',async()=>{
 const cmd=board(),action=prepare(cmd,null),draft={id:cmd.operationId,kind:'state',body:JSON.stringify(cmd)};
 for(const response of [{ok:true},{...action.receipt.response,operationId:id()},{...action.receipt.response,state:{...action.receipt.response.state,busyMinutes:30}}])assert.equal(client.readKitchenResult(response,draft).outcome,'unknown');
 assert.equal(client.readKitchenResult(action.receipt.response,draft).outcome,'applied');
 const calls=[];const lost=async(url,options)=>{calls.push({url,options});throw Error('Lost response');};
 assert.equal((await client.requestKitchen(draft,'submit',lost)).outcome,'unknown');assert.equal(calls.length,1);
 const recovered=async(url,options)=>{calls.push({url,options});return Response.json(action.receipt.response);};
 assert.equal((await client.requestKitchen(draft,'submit',recovered)).outcome,'applied');assert.equal(calls[0].options.body,calls[1].options.body);
 assert.equal((await client.requestKitchen(draft,'check',recovered)).outcome,'applied');assert.equal(calls.at(-1).url,'/api/kitchen/operation?id='+draft.id);
 const o=order(),m=move(o,'accepted'),r=prepare(m,o);assert.equal(client.readKitchenResult(r.receipt.response,{id:m.operationId,kind:'order',body:JSON.stringify(m)}).outcome,'applied');
});
