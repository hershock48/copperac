const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../..'),now=1800000000000,id=()=>crypto.randomUUID(),clean=x=>JSON.parse(JSON.stringify(x));
function load(file,mocks={},env={NODE_ENV:'production'},extra={}){
 const module={exports:{}};new vm.Script(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{filename:file}).runInNewContext({module,exports:module.exports,process:{env},Buffer,URL,Request,Response,AbortController,setTimeout,clearTimeout,console,...extra,require(n){if(Object.hasOwn(mocks,n))return mocks[n];if(n==='node:crypto')return crypto;if(n==='server-only')return {};throw Error('Unexpected dependency '+n);}});return module.exports;
}
const core=load('lib/ordering/printer-jobs.ts'),client=load('lib/ordering/printer-review.ts');
const ddl=`CREATE TABLE ordering_orders(id text PRIMARY KEY,status text NOT NULL,created_at bigint NOT NULL,data jsonb NOT NULL);CREATE TABLE ordering_print_jobs(id text PRIMARY KEY,printer_id text NOT NULL,order_id text NOT NULL,body text NOT NULL,status text NOT NULL,created_at bigint NOT NULL);CREATE TABLE ordering_printers(id text PRIMARY KEY,last_seen bigint NOT NULL);`;
const ready=(jobToken=null,statusCode='200 OK',printingInProgress=false)=>({jobToken,statusCode,printingInProgress});
async function fixture(dir){const db=new PGlite(dir);await db.exec(ddl+core.PRINT_SCHEMA);const q=(s,p)=>db.query(s,p);return {db,q,tx:fn=>db.transaction(t=>fn((s,p)=>t.query(s,p)))};}
async function seed(f,printer='kitchen',at=now,patch={}){const o={id:id(),number:42,status:'new',paid:true,totalCents:1199,createdAt:at,...patch},j=id();await f.q('INSERT INTO ordering_orders VALUES($1,$2,$3,$4)',[o.id,o.status,at,JSON.stringify(o)]);await f.q("INSERT INTO ordering_print_jobs(id,printer_id,order_id,body,status,created_at) VALUES($1,$2,$3,$4,'queued',$5)",[j,printer,o.id,'FIXTURE TICKET '+j,at]);return {o,j};}
async function raw(f,j){return (await f.q('SELECT * FROM ordering_print_jobs WHERE id=$1',[j])).rows[0];}
async function order(f,o){return (await f.q('SELECT data FROM ordering_orders WHERE id=$1',[o.id])).rows[0].data;}
async function command(f,j,mode='skip'){const issue=(await core.printStatus(f.q)).issues.find(x=>x.id===j);return {operationId:id(),printerId:issue.printerId,jobId:j,revision:issue.revision,mode,reason:'Physically checked at the fixture printer'};}
test('status parser accepts encoded and optional-null protocol fields without inferring success from missing codes',()=>{
 assert.deepEqual(clean(core.parsePrinterPoll({statusCode:'200%20OK',printingInProgress:null,jobToken:null})),ready());assert.equal(core.parsePrinterPoll({statusCode:'220 Busy'}).printingInProgress,true);
 assert.equal(core.printerCode('OK'),'200 OK');for(const v of [null,'','%','200\nOK','garbage'])assert.equal(core.printerCode(v),null);
 for(const body of [null,[],{}, {statusCode:'200',jobToken:'bad'},{statusCode:'200',printingInProgress:1}])assert.equal(core.parsePrinterPoll(body),null);
});
test('job token binds fetch and duplicate/delayed acknowledgements to one ticket',async()=>{
 const f=await fixture();try{const a=await seed(f),b=await seed(f,'kitchen',now+1);
  assert.equal((await core.pollPrintJob(f.tx,'kitchen',ready(),now)).id,a.j);
  assert.equal((await core.confirmPrintJob(f.tx,'kitchen',a.j,'kitchen','200 OK',now)).status,409);
  const served=await core.fetchPrintJob(f.tx,'kitchen',a.j,now+2);assert.equal(served.status,200);
  assert.equal((await core.fetchPrintJob(f.tx,'kitchen',a.j,now+3)).job.body,served.job.body);
  assert.equal((await core.fetchPrintJob(f.tx,'front',a.j,now)).status,404);assert.equal((await core.fetchPrintJob(f.tx,'kitchen',b.j,now)).status,409);
  assert.equal((await core.confirmPrintJob(f.tx,'kitchen',a.j,'kitchen','',now)).status,400);
  assert.equal((await core.confirmPrintJob(f.tx,'kitchen',a.j,'kitchen','200 OK',now+4)).status,200);
  assert.equal((await core.confirmPrintJob(f.tx,'kitchen',a.j,'kitchen','200%20OK',now+5)).duplicate,true);
  assert.equal((await core.fetchPrintJob(f.tx,'kitchen',a.j,now)).status,410);
  assert.equal((await order(f,a.o)).status,'accepted');assert.equal((await order(f,a.o)).paid,true);assert.equal((await order(f,a.o)).totalCents,1199);assert.equal((await raw(f,b.j)).status,'queued');assert.equal((await order(f,b.o)).status,'new');
  assert.equal((await core.pollPrintJob(f.tx,'kitchen',ready(a.j),now+6)).id,b.j);
  assert.equal((await core.confirmPrintJob(f.tx,'kitchen',a.j,'kitchen','500 Error',now)).status,409);
 }finally{await f.db.close();}
});
test('unfetched expiry is device-scoped, fetched uncertainty holds the queue across TTL, busy and printer failures',async()=>{
 const f=await fixture();try{const a=await seed(f),b=await seed(f,'front');await core.fetchPrintJob(f.tx,'kitchen',a.j,now);await seed(f,'kitchen',now+core.PRINT_TTL_MS);
  for(const poll of [ready(),ready(id()),ready(a.j,'500 Paper error'),ready(a.j,'220 Busy',true)])assert.equal(await core.pollPrintJob(f.tx,'kitchen',poll,now+core.PRINT_TTL_MS+1),null);
  assert.equal((await raw(f,a.j)).status,'fetched');assert.equal((await raw(f,b.j)).status,'queued');assert.equal((await core.fetchPrintJob(f.tx,'kitchen',a.j,now+core.PRINT_TTL_MS+1)).status,200);
  await core.pollPrintJob(f.tx,'front',ready(),now+core.PRINT_TTL_MS+1);assert.equal((await raw(f,b.j)).status,'expired');assert.equal((await core.printStatus(f.q)).issueCount,2);
 }finally{await f.db.close();}
});
test('front success never accepts an order; unsupported media failure can arrive before fetch',async()=>{
 const f=await fixture();try{const a=await seed(f,'front'),b=await seed(f,'kitchen');await core.fetchPrintJob(f.tx,'front',a.j,now);await core.confirmPrintJob(f.tx,'front',a.j,'front','200 OK',now);
 assert.equal((await order(f,a.o)).status,'new');assert.equal((await core.confirmPrintJob(f.tx,'kitchen',b.j,'kitchen','1000 Unsupported media',now)).status,200);assert.equal((await raw(f,b.j)).status,'failed');assert.equal((await order(f,b.o)).status,'new');
 }finally{await f.db.close();}
});
test('cancellation before fetch refuses paper and late success after cancellation cannot reopen or change money',async()=>{
 const f=await fixture();try{const a=await seed(f,'kitchen',now,{status:'cancelled'});assert.equal((await core.fetchPrintJob(f.tx,'kitchen',a.j,now)).status,410);
 await f.q("UPDATE ordering_print_jobs SET status='failed' WHERE id=$1",[a.j]);const b=await seed(f);await core.fetchPrintJob(f.tx,'kitchen',b.j,now);const cancelled={...b.o,status:'cancelled'};await f.q("UPDATE ordering_orders SET status='cancelled',data=$2 WHERE id=$1",[b.o.id,JSON.stringify(cancelled)]);
 assert.equal((await core.confirmPrintJob(f.tx,'kitchen',b.j,'kitchen','200 OK',now)).status,200);assert.deepEqual(await order(f,b.o),cancelled);
 }finally{await f.db.close();}
});
test('fetch, acknowledgement, owner review and replacement intent roll back if audit cannot be committed',async()=>{
 const f=await fixture();try{const a=await seed(f);
 const fail=()=>f.db.exec("CREATE OR REPLACE FUNCTION fail_print() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$;CREATE TRIGGER fail_print BEFORE INSERT ON ordering_print_history FOR EACH ROW EXECUTE FUNCTION fail_print();"),unfail=()=>f.db.exec('DROP TRIGGER fail_print ON ordering_print_history;');
 await fail();await assert.rejects(core.fetchPrintJob(f.tx,'kitchen',a.j,now));assert.equal((await raw(f,a.j)).status,'queued');await unfail();await core.fetchPrintJob(f.tx,'kitchen',a.j,now);
 await fail();await assert.rejects(core.confirmPrintJob(f.tx,'kitchen',a.j,'kitchen','200',now));assert.equal((await raw(f,a.j)).status,'fetched');assert.equal((await order(f,a.o)).status,'new');const cmd=await command(f,a.j,'reprint');await assert.rejects(core.resolvePrintJob(f.tx,cmd,'kitchen',now));assert.equal(await core.getPrintAction(f.q,cmd.operationId),null);assert.equal((await f.q('SELECT count(*)::int AS n FROM ordering_print_jobs')).rows[0].n,1);await unfail();assert.equal((await core.resolvePrintJob(f.tx,cmd,'kitchen',now)).outcome,'saved');
 }finally{await f.db.close();}
});
test('owner replacement is repeatable, fences old acknowledgements, preserves orders and records rejected stale reviews',async()=>{
 const f=await fixture();try{const a=await seed(f);await core.fetchPrintJob(f.tx,'kitchen',a.j,now);const cmd=await command(f,a.j,'reprint'),stale=await command(f,a.j,'confirm_printed');
 const first=await core.resolvePrintJob(f.tx,cmd,'kitchen',now+1),second=await core.resolvePrintJob(f.tx,cmd,'kitchen',now+2);assert.deepEqual(clean(first),clean(second));assert.equal((await f.q('SELECT count(*)::int AS n FROM ordering_print_jobs')).rows[0].n,2);
 assert.equal((await raw(f,first.replacementId)).body.startsWith('*** REPLACEMENT:'),true);assert.equal((await order(f,a.o)).status,'new');assert.equal((await core.confirmPrintJob(f.tx,'kitchen',a.j,'kitchen','200',now)).status,410);assert.equal((await core.pollPrintJob(f.tx,'kitchen',ready(a.j),now+3)).id,first.replacementId);
 assert.equal((await core.resolvePrintJob(f.tx,stale,'kitchen',now)).outcome,'rejected');assert.equal((await core.resolvePrintJob(f.tx,{...cmd,reason:'different'},'kitchen',now)).httpStatus,409);assert.deepEqual(clean(await core.getPrintAction(f.q,cmd.operationId)),clean(first));
 }finally{await f.db.close();}
});
test('physical owner check accepts only open kitchen orders; skip does not accept and closed orders cannot be reprinted',async()=>{
 const f=await fixture();try{const a=await seed(f);await core.fetchPrintJob(f.tx,'kitchen',a.j,now);await core.resolvePrintJob(f.tx,await command(f,a.j,'confirm_printed'),'kitchen',now);assert.equal((await order(f,a.o)).status,'accepted');
 const b=await seed(f);await core.fetchPrintJob(f.tx,'kitchen',b.j,now);await core.resolvePrintJob(f.tx,await command(f,b.j),'kitchen',now);assert.equal((await order(f,b.o)).status,'new');assert.equal((await raw(f,b.j)).status,'dismissed');
 const c=await seed(f,'kitchen',now,{status:'done'});await f.q("UPDATE ordering_print_jobs SET status='failed' WHERE id=$1",[c.j]);assert.equal((await core.resolvePrintJob(f.tx,await command(f,c.j,'reprint'),'kitchen',now)).httpStatus,409);
 }finally{await f.db.close();}
});
test('fetched jobs plus review receipts survive database restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'printer-jobs-'));let f=await fixture(dir);try{const a=await seed(f);await f.db.exec(core.PRINT_SCHEMA);await core.fetchPrintJob(f.tx,'kitchen',a.j,now);await f.db.close();let db=new PGlite(dir);f={db,q:(s,p)=>db.query(s,p),tx:fn=>db.transaction(t=>fn((s,p)=>t.query(s,p)))};
 assert.equal(await core.pollPrintJob(f.tx,'kitchen',ready(),now+1),null);const cmd=await command(f,a.j,'reprint'),result=await core.resolvePrintJob(f.tx,cmd,'kitchen',now+2);await f.db.close();db=new PGlite(dir);f={db,q:(s,p)=>db.query(s,p),tx:fn=>db.transaction(t=>fn((s,p)=>t.query(s,p)))};assert.deepEqual(clean(await core.resolvePrintJob(f.tx,cmd,'kitchen',now+3)),clean(result));
 }finally{await f.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('schema upgrade preserves a legacy queued ticket and is repeatable',async()=>{
 const db=new PGlite();try{await db.exec(ddl);const j=id();await db.query("INSERT INTO ordering_print_jobs VALUES($1,'kitchen','legacy-order','legacy paper','queued',$2)",[j,now]);await db.exec(core.PRINT_SCHEMA);await db.exec(core.PRINT_SCHEMA);const row=(await db.query('SELECT * FROM ordering_print_jobs WHERE id=$1',[j])).rows[0];assert.equal(row.body,'legacy paper');assert.equal(row.status,'queued');assert.equal(row.fetched_at,null);assert.equal(row.result_code,null);}finally{await db.close();}
});
test('review client rejects uncorrelated results and retries the exact same command after a lost response',async()=>{
 const cmd={operationId:id(),printerId:'kitchen',jobId:id(),revision:'a'.repeat(64),mode:'reprint',reason:'Checked'},result={operationId:cmd.operationId,command:cmd,outcome:'saved',httpStatus:200,message:'Queued',createdAt:now,replacementId:id()},calls=[];
 assert.equal(client.readPrintAction({...result,replacementId:undefined},cmd),null);assert.equal(client.readPrintAction({...result,operationId:id()},cmd),null);assert.equal(client.readPrintAction({...result,command:{...cmd,reason:'changed'}},cmd),null);
 const fake=async(url,options)=>{calls.push([url,options.body]);if(calls.length===1)throw Error('Response lost');return Response.json(result);};assert.equal(await client.requestPrintReview(cmd,false,fake),null);assert.deepEqual(clean(await client.requestPrintReview(cmd,false,fake)),result);assert.equal(calls[0][1],calls[1][1]);assert.deepEqual(clean(await client.requestPrintReview(cmd,true,fake)),result);assert.match(calls[2][0],new RegExp(cmd.operationId));
 assert.equal(core.parsePrintCommand({...cmd,reason:'\n'}),null);assert.equal(core.parsePrintCommand({...cmd,unexpected:true}),null);
});
const secret='fixture-secret-long-enough-for-production',config=[{id:'kitchen',token:secret,role:'kitchen',label:'Kitchen'}];
function request(url,method='GET',body,auth=true){const r=new Request('https://fixture.invalid'+url,{method,headers:{...(auth?{authorization:'Basic '+Buffer.from('kitchen:'+secret).toString('base64')}:{'x-fixture':'test'}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});r.nextUrl=new URL(r.url);return r;}
test('actual printer route enforces device Basic auth, persistent storage, explicit correlated results and empty DELETE responses',async()=>{
 const f=await fixture();try{const a=await seed(f,'kitchen',Date.now()),b=await seed(f,'kitchen',Date.now()+1),store={backend:'postgres',printerPoll:(p,v)=>core.pollPrintJob(f.tx,p,v),printerFetch:(p,j)=>core.fetchPrintJob(f.tx,p,j),printerConfirm:(p,j,r,c)=>core.confirmPrintJob(f.tx,p,j,r,c)};
 const api=load('app/api/printer/route.ts',{'next/server':{NextResponse:Response},'@/lib/ordering/printing':{configuredPrinters:()=>config},'@/lib/ordering/store':{getStore:()=>store},'@/lib/ordering/printer-jobs':core});
 assert.equal((await api.POST(request('/api/printer?token='+secret,'POST',{statusCode:'200'},false))).status,401);
 assert.equal((await api.POST(request('/api/printer','POST',{}))).status,400);assert.equal((await api.POST(request('/api/printer','POST',' '.repeat(16385)))).status,400);
 const poll=await api.POST(request('/api/printer','POST',{statusCode:'200%20OK'}));assert.deepEqual(await poll.json(),{jobReady:true,jobToken:a.j,mediaTypes:['text/plain'],deleteMethod:'DELETE'});assert.match(poll.headers.get('cache-control'),/no-store/);
 assert.equal((await api.GET(request('/api/printer'))).status,400);assert.equal((await api.GET(request('/api/printer?token='+a.j+'&type=image/png'))).status,406);assert.equal((await api.GET(request('/api/printer?token='+a.j))).status,200);
 assert.equal((await api.DELETE(request('/api/printer?token='+a.j,'DELETE'))).status,400);
 const ack=await api.DELETE(request('/api/printer?token='+a.j+'&code=200%20OK','DELETE'));assert.equal(ack.status,200);assert.equal(await ack.text(),'');
 assert.equal((await api.GET(request('/api/printer?delete&token='+a.j+'&code=200%20OK'))).status,200);assert.equal((await raw(f,b.j)).status,'queued');
 store.backend='memory';assert.equal((await api.POST(request('/api/printer','POST',{statusCode:'200'}))).status,503);
 }finally{await f.db.close();}
});
test('actual owner route denies staff, validates bounded requests and recovers the saved replacement result',async()=>{
 const f=await fixture();try{const a=await seed(f);await core.fetchPrintJob(f.tx,'kitchen',a.j,now);let role='staff';const store={backend:'postgres',getPrintAction:j=>core.getPrintAction(f.q,j),resolvePrintJob:(c,r)=>core.resolvePrintJob(f.tx,c,r,now)};
 const api=load('app/api/kitchen/print-review/route.ts',{'next/server':{},'@/lib/ordering/auth':{kitchenRole:async()=>role},'@/lib/ordering/store':{getStore:()=>store},'@/lib/ordering/printing':{configuredPrinters:()=>config},'@/lib/ordering/printer-jobs':core,'@/lib/ordering/kitchen-service':{kitchenReply:(data,status=200)=>Response.json(data,{status})}});
 const cmd=await command(f,a.j,'reprint');assert.equal((await api.POST(request('/api/kitchen/print-review','POST',cmd))).status,403);assert.equal((await api.GET(request('/api/kitchen/print-review?id='+cmd.operationId))).status,403);role='owner';
 assert.equal((await api.POST(request('/api/kitchen/print-review','POST',' '.repeat(4097)))).status,413);assert.equal((await api.POST(request('/api/kitchen/print-review','POST',{...cmd,reason:''}))).status,400);
 const result=await (await api.POST(request('/api/kitchen/print-review','POST',cmd))).json();assert.equal(result.outcome,'saved');assert.deepEqual(await (await api.GET(request('/api/kitchen/print-review?id='+cmd.operationId))).json(),result);assert.deepEqual(await (await api.POST(request('/api/kitchen/print-review','POST',cmd))).json(),result);
 assert.equal((await api.GET(request('/api/kitchen/print-review?id='+id()))).status,202);store.backend='memory';assert.equal((await api.POST(request('/api/kitchen/print-review','POST',cmd))).status,503);
 }finally{await f.db.close();}
});
test('printer configuration rejects ambiguous identities, weak production credentials and malformed JSON',()=>{
 const read=raw=>load('lib/ordering/printing.ts',{'./config':{ORDERING:{}}},{NODE_ENV:'production',ORDERING_PRINTERS:raw}).configuredPrinters();
 assert.deepEqual(clean(read(JSON.stringify(config))),config);assert.deepEqual(clean(read(undefined)),[]);
 for(const raw of ['invalid','{}',JSON.stringify([{...config[0],token:'short'}]),JSON.stringify([config[0],config[0]]),JSON.stringify([config[0],{...config[0],id:'second'}])])assert.throws(()=>read(raw));
});
test('Postgres wrapper uses one leased connection for commit/rollback and always releases it',async()=>{
 const calls=[];let fail=false,released=0;
 class Pool{async query(s){calls.push('pool:'+s.slice(0,25));return {rows:[]};}async connect(){return {query:async(s)=>{calls.push(s);if(fail&&s.startsWith('UPDATE ordering_printers'))throw Error('fixture outage');return {rows:[]};},release(){released++;}};}async end(){}}
 const mocks={'pg':{Pool},'./printer-jobs':core,'./kitchen-operations':{},'./order-acceptance':{},'./menu-document-store':{}},env={NODE_ENV:'production',DATABASE_URL:'postgres://fixture.invalid/db'};
 const store=load('lib/ordering/store.ts',mocks,env).getStore();assert.equal(await store.printerPoll('kitchen',ready()),null);assert.equal(released,1);assert(calls.includes('BEGIN ISOLATION LEVEL READ COMMITTED'));assert(calls.includes('COMMIT'));assert(!calls.includes('ROLLBACK'));
 fail=true;await assert.rejects(store.printerPoll('kitchen',ready()),/fixture outage/);assert.equal(released,2);assert.equal(calls.at(-1),'ROLLBACK');
});
