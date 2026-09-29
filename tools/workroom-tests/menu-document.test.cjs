const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../..');
function load(file,mocks={},env={},globals={}){
 const module={exports:{}};
 new vm.Script(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{filename:file}).runInNewContext({module,exports:module.exports,Buffer,Request,Response,URL,structuredClone,Date,process:{env},AbortController,setTimeout,clearTimeout,console,...globals,require(name){if(Object.hasOwn(mocks,name))return mocks[name];if(name==='./notification-outbox')return load('lib/ordering/notification-outbox.ts');if(name==='./printer-jobs')return load('lib/ordering/printer-jobs.ts');if(name==='node:crypto')return crypto;if(name==='server-only')return {};if(name==='../workroom/content-cas')return load('lib/workroom/content-cas.ts');if(name==='./menu-document-fields')return load('lib/ordering/menu-document-fields.ts');if(name==='./menu-document-store')return load('lib/ordering/menu-document-store.ts');throw Error('Unexpected dependency '+name);}});
 return module.exports;
}
const fields=load('lib/ordering/menu-document-fields.ts'),core=load('lib/ordering/menu-document-store.ts');
const clean=x=>JSON.parse(JSON.stringify(x));
const doc=()=>[{name:'Fixture',ageRestricted:false,items:[{id:'fixture-fries',name:'Fries',desc:'Fixture menu',priceCents:700,image:null,groups:[{name:'Sauce',required:false,multi:false,choices:[{name:'Mayo',priceCents:50}]}]}]}];
const changed=(cents=850)=>{const d=doc();d[0].items[0].priceCents=cents;return d;};
const ddl='CREATE TABLE ordering_menu(id int PRIMARY KEY,data jsonb NOT NULL);'+core.MENU_HISTORY_SCHEMA;
const query=db=>(sql,params)=>db.query(sql,params);
async function record(db){const r=(await db.query('SELECT data,revision FROM ordering_menu WHERE id=1')).rows[0];return r?{doc:r.data,revision:r.revision}:null;}
const request=body=>new Request('https://fixture.invalid/api/kitchen/menu',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function routeHarness(){
 let current=null,history=[],role='owner',off=false,afterSaveFailure=false,backend='postgres';
 const calls={body:0,saves:0};
 const store={get backend(){return backend;},getMenuRecord:async()=>{if(off)throw Error('offline');return structuredClone(current);},compareMenuDoc:async(expected,value,before)=>{calls.saves++;const result=core.compareMenuMemory(current,history,expected,value,before);if(result)current=structuredClone(result);return result;},menuHistory:async()=>{if(afterSaveFailure)throw Error('lost receipt');return history.map(({id,changedAt})=>({id,changedAt}));}};
 const menu={seedMenuDoc:doc,validateMenuDoc:fields.validateMenuDoc,invalidateMenuCache(){}};
 const route=load('app/api/kitchen/menu/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/ordering/auth':{kitchenRole:async()=>role},'@/lib/ordering/menu':menu,'@/lib/ordering/menu-document-store':core,'@/lib/ordering/store':{getStore:()=>store}},{NODE_ENV:'production'});
 return {route,store,calls,menu,read:()=>route.GET(),save:body=>route.PUT(request(body)),current:()=>current,history:()=>history,setRole:r=>role=r,setOffline:v=>off=v,setBackend:b=>backend=b,loseAck:v=>afterSaveFailure=v};
}
test('menu decimal drafts preserve invalid input and convert valid cents exactly without rounding',()=>{
 for(const text of ['', '1e2','1.999','-1','abc','0x10','1000.01','  ','1.2.3','01'])assert.equal(fields.parseMenuPrice(text),null,text);
 for(const [text,cents]of [['0',0],[' 0.50 ',50],['19.99',1999],['1000.00',100000],['1.2',120]])assert.equal(fields.parseMenuPrice(text),cents);
 const draft=fields.toMenuDraft(doc());draft[0].items[0].priceCents='invalid';assert.match(fields.prepareMenuDraft(draft).error,/price/);assert.equal(draft[0].items[0].priceCents,'invalid');
 draft[0].items[0].priceCents='7.00';draft[0].items[0].groups[0].choices[0].priceCents='0.123';assert.match(fields.prepareMenuDraft(draft).error,/choice price/);
 assert.deepEqual(clean(fields.prepareMenuDraft(fields.toMenuDraft(doc())).doc),doc());
});
test('complete menu validation rejects ambiguous choices, bad visibility, unsafe photos and oversized content; bundled source still passes',()=>{
 assert.equal(fields.validateMenuDoc(JSON.parse(fs.readFileSync(path.join(root,'lib/ordering/toast-menu.json'),'utf8'))),null);
 for(const change of [d=>d[0].items[0].hidden='yes',d=>d[0].items[0].groups.push(d[0].items[0].groups[0]),d=>d[0].items[0].groups[0].choices.push(d[0].items[0].groups[0].choices[0]),d=>d[0].items[0].image='javascript:alert(1)',d=>d[0].items[0].desc='x'.repeat(4001),d=>d[0].items[0].priceCents=1.1]){const d=doc();change(d);assert.notEqual(fields.validateMenuDoc(d),null);}
 const snapshot={ok:true,doc:doc(),revision:'a'.repeat(64),backend:'postgres',history:[]};assert.equal(fields.isMenuSnapshot(snapshot),true);assert.equal(fields.isMenuSnapshot({...snapshot,revision:''}),false);assert.equal(fields.isMenuSnapshot({...snapshot,history:[{id:'x',changedAt:'bad'}]}),false);
 const reordered=doc().map(s=>({items:s.items,ageRestricted:s.ageRestricted,name:s.name}));assert.equal(fields.menuDocumentJSON(reordered),fields.menuDocumentJSON(doc()));
});
test('first SQL saves have one winner, and audit insertion failure rolls back both creation and later edits',async()=>{
 const db=new PGlite();try{await db.exec(ddl);
  await db.exec("ALTER TABLE ordering_menu_history ADD CONSTRAINT fixture_block CHECK(false)");await assert.rejects(core.compareMenu(query(db),null,doc(),doc()));assert.equal((await db.query('SELECT * FROM ordering_menu')).rows.length,0);
  await db.exec('ALTER TABLE ordering_menu_history DROP CONSTRAINT fixture_block');
  const results=await Promise.all([core.compareMenu(query(db),null,doc(),doc()),core.compareMenu(query(db),null,changed(),doc())]);assert.equal(results.filter(Boolean).length,1);assert.equal((await db.query('SELECT * FROM ordering_menu_history')).rows.length,1);
  const before=await record(db);await db.exec("ALTER TABLE ordering_menu_history ADD CONSTRAINT fixture_block CHECK(after_data=before_data) NOT VALID");await assert.rejects(core.compareMenu(query(db),before,changed(900),before.doc));assert.deepEqual(await record(db),before);assert.equal((await db.query('SELECT * FROM ordering_menu_history')).rows.length,1);
 }finally{await db.close();}
});
test('SQL rejects stale and ABA edits, records actual before/after snapshots and survives reopening',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'copper-menu-'));let db=new PGlite(dir);
 try{await db.exec('CREATE TABLE ordering_menu(id int PRIMARY KEY,data jsonb NOT NULL)');await db.query('INSERT INTO ordering_menu VALUES(1,$1)',[JSON.stringify(doc())]);await db.exec(core.MENU_HISTORY_SCHEMA);const initial=await record(db);assert.equal(initial.revision,'legacy');
  const next=await core.compareMenu(query(db),initial,changed(),initial.doc);assert(next);assert.equal(await core.compareMenu(query(db),initial,changed(990),initial.doc),null);
  const back=await core.compareMenu(query(db),next,doc(),next.doc);assert(back);assert.notEqual(core.menuRevision(back,back.doc),core.menuRevision(initial,initial.doc));assert.equal(await core.compareMenu(query(db),initial,changed(990),initial.doc),null);
  const history=(await db.query('SELECT * FROM ordering_menu_history ORDER BY changed_at')).rows;assert.deepEqual(history[0].before_data,doc());assert.deepEqual(history[0].after_data,changed());
  await db.close();db=new PGlite(dir);assert.deepEqual(await record(db),clean(back));assert.equal((await db.query('SELECT * FROM ordering_menu_history')).rows.length,2);
 }finally{await db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('memory menu access clones records/history and production volatile saves are refused',async()=>{
 const mocks={'./order-acceptance':load('lib/ordering/order-acceptance.ts'),'./kitchen-operations':load('lib/ordering/kitchen-operations.ts')};
 const store=load('lib/ordering/store.ts',mocks,{NODE_ENV:'development'}).getStore();const source=doc();const saved=await store.compareMenuDoc(null,source,source);source[0].name='Mutated';saved.doc[0].name='Changed';assert.equal((await store.getMenuDoc())[0].name,'Fixture');
 const record=await store.getMenuRecord();record.doc[0].name='Another';assert.equal((await store.getMenuDoc())[0].name,'Fixture');assert.equal(await store.compareMenuDoc(null,changed(),doc()),null);assert.equal((await store.menuHistory()).length,1);
 const production=load('lib/ordering/store.ts',mocks,{NODE_ENV:'production'}).getStore();await assert.rejects(production.compareMenuDoc(null,doc(),doc()));
});
test('route uses fresh revision, rejects stale/invalid input, and keeps committed work after a lost acknowledgement',async()=>{
 const h=routeHarness(),first=await(await h.read()).json();assert(fields.isMenuSnapshot(first));assert.match((await h.read()).headers.get('cache-control'),/private/);
 assert.equal((await h.save({doc:changed(),revision:first.revision})).status,200);assert.equal(h.calls.saves,1);
 assert.equal((await h.save({doc:changed(999),revision:first.revision})).status,409);assert.equal(h.calls.saves,1);
 const latest=await(await h.read()).json();h.loseAck(true);assert.equal((await h.save({doc:changed(900),revision:latest.revision})).status,503);assert.equal(h.current().doc[0].items[0].priceCents,900);h.loseAck(false);
 assert.equal((await h.save({doc:changed(900),revision:latest.revision})).status,409);assert.equal(h.history().length,2);
 for(const body of [null,[],{}, {doc:doc(),revision:123},{doc:[],revision:first.revision},{doc:doc(),revision:first.revision,extra:true}])assert.equal((await h.save(body)).status,400);
 const fresh=await(await h.read()).json();assert.equal(fresh.doc[0].items[0].priceCents,900);assert.equal(fresh.history.length,2);
});
test('route denies staff, missing authentication, volatile production, outages and oversized bodies before mutation',async()=>{
 const h=routeHarness();const unreadable={get headers(){throw Error('Must not parse');}};
 h.setRole('staff');assert.equal((await h.route.PUT(unreadable)).status,403);assert.equal((await h.read()).status,403);h.setRole(null);assert.equal((await h.route.PUT(unreadable)).status,401);
 h.setRole('owner');h.setBackend('memory');assert.equal((await h.route.PUT(unreadable)).status,503);h.setBackend('postgres');h.setOffline(true);assert.equal((await h.read()).status,503);h.setOffline(false);
 const body={doc:doc(),revision:(await(await h.read()).json()).revision};body.doc[0].items[0].desc='x'.repeat(524289);assert.equal((await h.save(body)).status,400);assert.equal(h.calls.saves,0);
 const before=await(await h.read()).json();h.menu.seedMenuDoc=()=>changed();assert.equal((await h.save({doc:doc(),revision:before.revision})).status,409);
});
test('client save helper keeps uncertain/rejected drafts and sends one bounded request',async()=>{
 const client=load('lib/workroom/owner-save.ts');const snapshot={ok:true,doc:doc(),revision:'a'.repeat(64),backend:'postgres',history:[]};
 for(const status of [400,401,409,503]){let count=0;const result=await client.saveOwnerDraft('/fixture',{doc:doc()},fields.isMenuSnapshot,async()=>{count++;return Response.json({error:'fixture'},{status});},100);assert.notEqual(result.kind,'saved');assert.equal(count,1);}
 assert.equal((await client.saveOwnerDraft('/fixture',{},fields.isMenuSnapshot,async()=>Response.json(snapshot),100)).kind,'saved');
 assert.equal((await client.saveOwnerDraft('/fixture',{},fields.isMenuSnapshot,async()=>Response.json({ok:true}),100)).kind,'uncertain');
 assert.equal((await client.saveOwnerDraft('/fixture',{},fields.isMenuSnapshot,async(_url,opts)=>new Promise((_resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('timeout')))),1)).kind,'uncertain');
});
