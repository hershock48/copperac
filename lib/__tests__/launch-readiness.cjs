const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
let now=1700000000000;
class Clock extends Date { static now(){return now;} }
function load(file,mocks={},env={},fetch){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new vm.Script(code).runInNewContext({module,exports:module.exports,require:name=>{
  if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name==='node:net')return require('node:net');
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name==='./content-cas'||name==='@/lib/workroom/content-cas')return load('lib/workroom/content-cas.ts');
  if(name==='./event-cas')return load('lib/workroom/event-cas.ts');
  throw Error('Unexpected import '+name);
 },process:{env},Buffer,structuredClone,Date:Clock,URL,AbortSignal,fetch,console:{error(){}}});return module.exports;
}
const json=(body,options={})=>({status:options.status||200,body,headers:options.headers});
const next={'next/server':{NextResponse:{json}}};
const secret='fixture-secret-'.repeat(4),passcode='fixture-owner';

test('signed cookies reject old hashes, forged roles, expiry and changed credentials',async()=>{
 now=1700000000000;
 const session=load('lib/workroom/session.ts');let held,options;
 const env={NODE_ENV:'production',WORKROOM_PASSCODE:passcode,WORKROOM_SESSION_SECRET:secret};
 const auth=load('lib/workroom/auth.ts',{'./session':session,'next/headers':{cookies:async()=>({get:()=>({value:held}),set:(name,value,opts)=>{held=value;options=opts;}})}},env);
 held=crypto.createHash('sha256').update('copperac-workroom-v1:'+passcode).digest('hex');
 assert.equal(await auth.isWorkroomAuthed(),false);
 await auth.setWorkroomCookie(passcode);const valid=held;
 assert.equal(await auth.isWorkroomAuthed(),true);assert.equal(options.sameSite,'strict');assert.equal(options.secure,true);assert.equal(options.httpOnly,true);
 assert.equal(held.includes(passcode),false);
 held+='x';assert.equal(await auth.isWorkroomAuthed(),false);held=valid;
 env.WORKROOM_PASSCODE='rotated';assert.equal(await auth.isWorkroomAuthed(),false);env.WORKROOM_PASSCODE=passcode;
 now+=19*60*60*1000;assert.equal(await auth.isWorkroomAuthed(),false);
 await assert.rejects(auth.setWorkroomCookie('wrong'));
});
test('production sign-in closes without a separate session secret',async()=>{
 const auth=load('lib/workroom/auth.ts',{'./session':load('lib/workroom/session.ts'),'next/headers':{cookies:()=>{throw Error('Should not read cookies');}}},{NODE_ENV:'production',WORKROOM_PASSCODE:passcode});
 assert.equal(auth.workroomSessionReady(),false);assert.equal(await auth.isWorkroomAuthed(),false);
});
test('production memory writes fail, local demos remain usable, and ambiguous databases are not chosen',async()=>{
 for(const mode of ['production','development']){
  const store=load('lib/workroom/store.ts',{}, {NODE_ENV:mode}).getStore();
  const write=()=>store.events.put({id:'event',createdAt:1});
  if(mode==='production') {await assert.rejects(write());await assert.rejects(store.setValue('menu',{}));await assert.rejects(store.events.remove('event'));}
  else {await write();assert.equal((await store.events.get('event')).id,'event');}
 }
 assert.equal(load('lib/workroom/store.ts',{}, {FIRST_DATABASE_URL:'one',SECOND_DATABASE_URL:'two'}).connectionVar(),null);
 assert.equal(load('lib/workroom/store.ts',{}, {DATABASE_URL:'chosen',OTHER_DATABASE_URL:'other'}).connectionVar(),'DATABASE_URL');
});
test('concurrent store initialization shares one pool and schema failures are retried',async()=>{
 let pools=0,fail=true;
 class Pool {constructor(){pools++;}async query(){if(fail)throw Error('Schema unavailable');return {rows:[]};}}
 const store=load('lib/workroom/store.ts',{'pg':{Pool}},{DATABASE_URL:'postgres://fixture.invalid/test'});
 await assert.rejects(store.workroomDatabase());fail=false;
 const result=await Promise.all([store.workroomDatabase(),store.workroomDatabase()]);
 assert.equal(pools,2);assert.equal(result[0],result[1]);
});
test('login throttling has a bounded local window and requires persistence in production',async()=>{
 const mocks={'./store':{connectionVar:()=>null}};
 const dev=load('lib/workroom/login-limit.ts',mocks,{NODE_ENV:'development'});
 for(let i=0;i<5;i++)assert.equal(await dev.allowLogin('a',1000),true);
 assert.equal(await dev.allowLogin('a',1000),false);assert.equal(await dev.allowLogin('a',601001),true);
 await assert.rejects(load('lib/workroom/login-limit.ts',mocks,{NODE_ENV:'production'}).allowLogin('a'));
});
test('all workroom mutation routes refuse volatile production saves before reading request bodies',async()=>{
 const env={NODE_ENV:'production'};
 const guard=load('lib/workroom/write-guard.ts',{...next,'./store':{connectionVar:()=>null}},env);
 for(const [file,method] of [['events','PUT'],['events','DELETE'],['menu','PUT'],['events/contact','PUT'],['events/image','POST']]){
  const route=load(`app/api/workroom/${file}/route.ts`,{...next,'next/cache':{},'@/lib/workroom/auth':{isWorkroomAuthed:async()=>true},'@/lib/workroom/write-guard':guard,'@/lib/workroom/store':{getStore:()=>({backend:'memory'})},'@/lib/workroom/event-service':{},'@/lib/workroom/event-photo':{},'@/lib/workroom/menu-write':{},'@/lib/content':{},'@/lib/workroom/events-def':{},'@/lib/workroom/menu-def':{}},env);
  let parsed=0;const response=await route[method]({json:async()=>{parsed++;throw Error('Must reject before parsing');}});assert.equal(parsed,0,file);
  assert.equal(response.status,503,file);assert.match(response.body.error,/not been saved|Persistent storage/);
 }
});
test('login rejects null input, throttled attempts and storage outages without issuing cookies',async()=>{
 for(const scenario of ['null','limited','storage']){
  let issued=0;
  const route=load('app/api/workroom/login/route.ts',{...next,'@/lib/workroom/auth':{workroomPasscode:()=>passcode,workroomSessionReady:()=>true,passcodeMatches:()=>false,setWorkroomCookie:async()=>{issued++;}},'@/lib/workroom/login-limit':{loginClient:()=> 'a',allowLogin:async()=>{if(scenario==='storage')throw Error('Offline');return scenario!=='limited';},clearLoginAttempts:async()=>{}}});
  assert.equal((await route.POST({json:async()=>null})).status,{null:401,limited:429,storage:503}[scenario]);assert.equal(issued,0);
 }
});
test('client hosts cannot reach parked ordering APIs or kitchen; pitch host retains the demo',()=>{
 class Response {constructor(body,options){this.status=options.status;}static next(){return {status:200};}static redirect(url){return {status:307,url:String(url)};}}
 const {proxy}=load('proxy.ts',{'next/server':{NextResponse:Response}});
 const request=(host,p)=>({headers:{get:()=>host},nextUrl:{pathname:p,clone:()=>new URL('https://'+host+p)}});
 for(const host of ['copperac.com','www.copperac.com','copperac.vercel.app']){
  for(const route of ['/api/ordering/order','/api/ordering/attempt','/api/kitchen/menu','/api/kitchen/orders','/api/kitchen/operation','/api/kitchen/print-review','/api/kitchen/notifications','/api/kitchen/notifications/dispatch','/api/printer'])assert.equal(proxy(request(host,route)).status,404);
  assert.equal(proxy(request(host,'/kitchen')).status,307);
 }
 assert.equal(proxy(request('copperac.glazedweb.com','/api/ordering/order')).status,200);
});
test('inquiry never claims success without a provider acceptance ID',async()=>{
 const fields={first:'Fixture',last:'Person',email:'fixture@example.invalid',phone:'5551234567',message:'Controlled test'};
 for(const outcome of ['accepted','missing-id','provider-error','network-error']){
  const route=load('app/api/inquiry/route.ts',{...next,'@/lib/site':{SITE:{email:'shop@example.invalid',url:'https://example.invalid'}}},{RESEND_API_KEY:'fixture',INQUIRY_FROM:'test@example.invalid'},async(url,opts)=>{
   assert.ok(opts.signal);if(outcome==='network-error')throw Error('Offline');
   return {ok:outcome!=='provider-error',status:400,text:async()=>'',json:async()=>outcome==='accepted'?{id:'message'}:{}};
  });
  const response=await route.POST({json:async()=>fields});assert.equal(response.status,outcome==='accepted'?200:502);assert.equal(response.body.ok,outcome==='accepted');
 }
});
