const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const app = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name;
assert(['mikesplace','copperac'].includes(app), 'Expected a supported client package');
const prefix = app === 'copperac' ? 'copper' : 'mikes';
const cookie = prefix + '_kitchen', ownerCookie = app + '_workroom';
const production = () => ({ NODE_ENV: 'production', KITCHEN_PIN: '726491', WORKROOM_PASSCODE: 'fixture-owner-only', WORKROOM_SESSION_SECRET: 'fixture-signing-key-not-a-real-secret-2026' });
function load(file, mocks = {}, env = {}, clock = { now: 1_800_000_000_000 }) {
 const module = { exports: {} };
 class ClockDate extends Date { static now() { return clock.now; } }
 const context = vm.createContext({ module, exports: module.exports, Buffer, Request, Response, URL, structuredClone, process: { env }, Date: ClockDate, console: { error() {}, warn() {} },
  require(name) {
   if (Object.hasOwn(mocks,name)) return mocks[name];
   if (name === 'server-only') return {};
   if (name === 'node:crypto') return crypto;
   throw Error('Unexpected dependency: '+name);
  }
 });
 new vm.Script(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { filename: file }).runInContext(context);
 return module.exports;
}
function authentication(env = production(), clock = { now: 1_800_000_000_000 }) {
 const writes = [], values = new Map();
 const jar = { get: name => values.has(name) ? { value: values.get(name) } : undefined, set(name,value,options) { writes.push({name,value,options}); values.set(name,value); } };
 const headers = { cookies: async () => jar }, session = load('lib/workroom/session.ts',{},env,clock);
 const owner = load('lib/workroom/auth.ts', { './session': session, 'next/headers': headers }, env, clock);
 const config = load('lib/ordering/config.ts', app === 'mikesplace' ? { '@/lib/site': load('lib/site.ts') } : {});
 const auth = load('lib/ordering/auth.ts', { '../workroom/session': session, '../workroom/auth': owner, 'next/headers': headers, './config': config }, env, clock);
 return {auth,owner,session,config,values,writes,env,clock};
}
const next = { NextResponse: { json: (body,init) => Response.json(body,init) } };
function loginRoute(a, allowKitchenLogin = async () => true) {
 return load('app/api/kitchen/login/route.ts', { 'next/server': next, '@/lib/ordering/auth': a.auth, '@/lib/workroom/auth': a.owner, '@/lib/ordering/login-limit': { allowKitchenLogin } });
}
const request = (body,headers = {},method = 'POST') => new Request('https://fixture.invalid/api/kitchen/login', { method, headers: { 'Content-Type':'application/json', Origin:'https://fixture.invalid', ...headers }, ...(method === 'POST' ? {body:JSON.stringify(body)} : {}) });

test('kitchen sessions reject raw PINs, forgery, other apps and owner-role tokens', async () => {
 const a = authentication();
 a.values.set(cookie,a.env.KITCHEN_PIN); assert.equal(await a.auth.isKitchenAuthed(),false);
 await a.auth.setKitchenCookie(a.env.KITCHEN_PIN);
 assert.equal(await a.auth.kitchenRole(),'staff'); assert.equal(await a.owner.isWorkroomAuthed(),false);
 const issued = a.writes.at(-1);
 assert(!issued.value.includes(a.env.KITCHEN_PIN));
 assert.equal(issued.options.httpOnly,true); assert.equal(issued.options.secure,true); assert.equal(issued.options.sameSite,'strict'); assert.equal(issued.options.maxAge,64800);
 a.values.set(cookie,issued.value+'x'); assert.equal(await a.auth.isKitchenAuthed(),false);
 for (const [label,role] of [[(app === 'copperac' ? 'mikesplace' : 'copperac')+'-kitchen-v1','staff'],[app+'-workroom-v2','staff'],[app+'-kitchen-v1','owner']]) {
  const secret = crypto.createHmac('sha256',a.env.WORKROOM_SESSION_SECRET).update(label).digest('hex');
  a.values.set(cookie,a.session.issueSession(role,a.env.KITCHEN_PIN,secret)); assert.equal(await a.auth.isKitchenAuthed(),false);
 }
 a.values.set(ownerCookie,issued.value); assert.equal(await a.owner.isWorkroomAuthed(),false);
});

test('expiry, PIN rotation, signing-secret rotation and sign-out revoke kitchen access', async () => {
 const a = authentication(); await a.auth.setKitchenCookie(a.env.KITCHEN_PIN);
 a.clock.now += 64800000; assert.equal(await a.auth.isKitchenAuthed(),false);
 a.clock.now -= 64800000; assert.equal(await a.auth.isKitchenAuthed(),true);
 a.env.KITCHEN_PIN='976291'; assert.equal(await a.auth.isKitchenAuthed(),false);
 a.env.KITCHEN_PIN='726491'; a.env.WORKROOM_SESSION_SECRET='another-fixture-secret-with-more-than-32-characters'; assert.equal(await a.auth.isKitchenAuthed(),false);
 a.env.WORKROOM_SESSION_SECRET=production().WORKROOM_SESSION_SECRET;
 await a.auth.clearKitchenCookie(); assert.equal(await a.auth.isKitchenAuthed(),false); assert.equal(a.writes.at(-1).options.maxAge,0);
});

test('production rejects missing, public, short, nonnumeric and shared credentials; development stays isolated', async () => {
 for (const patch of [{KITCHEN_PIN:''},{KITCHEN_PIN:'0133'},{KITCHEN_PIN:'0116'},{KITCHEN_PIN:'12345'},{KITCHEN_PIN:'abcdef'},{KITCHEN_PIN:'1'.repeat(13)},{KITCHEN_PIN:'123456',WORKROOM_PASSCODE:'123456'},{WORKROOM_SESSION_SECRET:''},{WORKROOM_SESSION_SECRET:'short'},{WORKROOM_SESSION_SECRET:production().WORKROOM_PASSCODE,WORKROOM_PASSCODE:production().WORKROOM_PASSCODE}]) {
  const a=authentication({...production(),...patch}); assert.equal(a.auth.kitchenSessionReady(),false);
  await assert.rejects(a.auth.setKitchenCookie(a.env.KITCHEN_PIN)); assert.equal(a.writes.length,0);
 }
 const dev = authentication({NODE_ENV:'development'}); assert.equal(dev.auth.kitchenSessionReady(),true);
 await dev.auth.setKitchenCookie(dev.config.KITCHEN_PIN_FALLBACK); assert.equal(await dev.auth.kitchenRole(),'staff');
 const restarted = authentication({NODE_ENV:'development'}); restarted.values.set(cookie,dev.writes.at(-1).value);
 assert.equal(await restarted.auth.isKitchenAuthed(),false);
});

test('owner workroom session opens the kitchen independently of staff PIN and logout clears both', async () => {
 const a = authentication(); await a.auth.setKitchenCookie(a.env.KITCHEN_PIN); await a.owner.setWorkroomCookie(a.env.WORKROOM_PASSCODE);
 assert.equal(await a.auth.kitchenRole(),'owner');
 const route=loginRoute(a); const probe=await route.GET(); assert.equal(probe.status,200); assert.equal((await probe.json()).role,'owner');
 assert.equal(probe.headers.get('cache-control'),'private, no-store');
 assert.equal((await route.DELETE(request(null,{},'DELETE'))).status,200);
 assert.equal(await a.auth.kitchenRole(),null); assert.equal(await a.owner.isWorkroomAuthed(),false);
 assert.equal(a.values.get(cookie),''); assert.equal(a.values.get(ownerCookie),'');
 a.env.KITCHEN_PIN=''; await a.owner.setWorkroomCookie(a.env.WORKROOM_PASSCODE); assert.equal(await a.auth.kitchenRole(),'owner');
});

test('cross-site login/logout and incomplete configuration cannot change sessions or reserve guesses', async () => {
 const a=authentication(); let reservations=0; const route=loginRoute(a,async()=>{reservations++;return true;});
 for(const headers of [{Origin:'https://other.invalid'},{'Sec-Fetch-Site':'cross-site'}]) {
  assert.equal((await route.POST(request({pin:a.env.KITCHEN_PIN},headers))).status,403);
  assert.equal((await route.DELETE(request(null,headers,'DELETE'))).status,403);
 }
 assert.equal(reservations,0); assert.equal(a.writes.length,0);
 a.env.KITCHEN_PIN=''; assert.equal((await route.POST(request({pin:'anything'}))).status,503); assert.equal(reservations,0);
});

test('kitchen login counts malformed/oversized input and refuses throttled or failed storage before a cookie', async () => {
 const a=authentication(); let count=0; const route=loginRoute(a,async()=>{count++;return true;});
 for(const body of [null,{}, {pin:726491}, {pin:'wrong'}, {pin:'x'.repeat(2000)}]) assert.equal((await route.POST(request(body))).status,401);
 assert.equal(count,5); assert.equal(a.writes.length,0);
 const oversized=new Request('https://fixture.invalid/api/kitchen/login',{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(1025)+JSON.stringify({pin:a.env.KITCHEN_PIN})});
 assert.equal((await route.POST(oversized)).status,401);
 for(const [allow,status] of [[async()=>false,429],[async()=>{throw Error('offline');},503]]) {
  const response=await loginRoute(a,allow).POST(request({pin:a.env.KITCHEN_PIN}));
  assert.equal(response.status,status); assert.equal(a.writes.length,0);
  if(status===429)assert.equal(response.headers.get('retry-after'),'600');
 }
 assert.equal((await route.POST(request({pin:a.env.KITCHEN_PIN}))).status,200); assert.equal(await a.auth.kitchenRole(),'staff');
});

test('browser origin matches the public Host through internal Next URLs but not another host', async () => {
 const a=authentication(), route=loginRoute(a);
 const proxied=origin=>new Request('http://internal-next.invalid/api/kitchen/login',{method:'POST',headers:{Host:'public-fixture.invalid',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({pin:a.env.KITCHEN_PIN})});
 assert.equal((await route.POST(proxied('https://public-fixture.invalid'))).status,200);
 for(const origin of ['https://other.invalid','null','https://public-fixture.invalid.evil.invalid','https://public-fixture.invalid/path','https://public-fixture.invalid:1234']) {
  assert.equal((await route.POST(proxied(origin))).status,403);
 }
});

test('local kitchen counters are bounded and production cannot use memory sign-in', async () => {
 const mocks={'../workroom/store':{connectionVar:()=>null,workroomDatabase:async()=>{throw Error('not configured');}}};
 const local=load('lib/ordering/login-limit.ts',mocks,{NODE_ENV:'development'});
 assert.deepEqual(await Promise.all(Array.from({length:9},()=>local.allowKitchenLogin(1000000))),[true,true,true,true,true,false,false,false,false]);
 assert.equal(await local.allowKitchenLogin(1600000),true);
 await assert.rejects(load('lib/ordering/login-limit.ts',mocks,{NODE_ENV:'production'}).allowKitchenLogin());
});

test('atomic kitchen reservations share a bounded bucket across instances and survive database restart independently of owner', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kitchen-auth-')); let db=new PGlite(dir);
 const instance=()=>load('lib/ordering/login-limit.ts',{'../workroom/store':{connectionVar:()=> 'DATABASE_URL',workroomDatabase:async()=>({query:(sql,params)=>db.query(sql,params)})}},{NODE_ENV:'production'});
 try {
  await db.exec(`CREATE TABLE ${prefix}_login_attempts(id text PRIMARY KEY,attempts integer NOT NULL,started bigint NOT NULL); INSERT INTO ${prefix}_login_attempts VALUES('owner',3,1000000)`);
  const a=instance(),b=instance(); const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).allowKitchenLogin(1000000)));
  assert.equal(results.filter(Boolean).length,5);
  assert.equal((await db.query(`SELECT attempts FROM ${prefix}_login_attempts WHERE id='owner'`)).rows[0].attempts,3);
  assert.equal((await db.query(`SELECT attempts FROM ${prefix}_login_attempts WHERE id='kitchen'`)).rows[0].attempts,6);
  await db.close(); db=new PGlite(dir); assert.equal(await instance().allowKitchenLogin(1000001),false);
  assert.equal(await instance().allowKitchenLogin(1600000),true);
 } finally { await db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});

if(app==='copperac')test('parked menu price API refuses staff before reading body or touching storage, and accepts signed owner access', async()=>{
 let touched=0, role='staff';
 const route=load('app/api/kitchen/menu/route.ts',{
  'next/server':next,'@/lib/ordering/auth':{kitchenRole:async()=>role},
  '@/lib/ordering/menu':{invalidateMenuCache(){},seedMenuDoc:()=>[],validateMenuDoc:()=>null},
  '@/lib/ordering/menu-document-store':{menuRevision:()=> 'a'.repeat(64)},
  '@/lib/ordering/store':{getStore:()=>{touched++;return {backend:"postgres",getMenuRecord:async()=>null,menuHistory:async()=>[],compareMenuDoc:async()=>({doc:[],revision:"saved"})};}}
 });
 const badRequest={json:async()=>{throw Error('Must not parse');}};
 assert.equal((await route.GET()).status,403); assert.equal((await route.PUT(badRequest)).status,403); assert.equal(touched,0);
 role=null; assert.equal((await route.PUT(badRequest)).status,401); assert.equal(touched,0);
 role='owner'; assert.equal((await route.GET()).status,200); assert.equal((await route.PUT(new Request('https://fixture.invalid/api/kitchen/menu',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({doc:[],revision:'a'.repeat(64)})}))).status,200); assert.equal(touched,2);
});
