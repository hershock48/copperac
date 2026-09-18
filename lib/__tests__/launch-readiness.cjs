const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
let now=1700000000000;
class Clock extends Date { static now(){return now;} }
// `globals` overrides one of the sandbox globals below, so a test can watch
// what the module under test asks the platform for (AbortSignal.timeout).
// Any import not mocked throws, which is how these tests also prove a route
// reaches nothing it should not: the inquiry route loads with next/server and
// @/lib/site mocked and nothing else, so it cannot be touching the store.
function load(file,mocks={},env={},fetch,globals={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new vm.Script(code).runInNewContext({module,exports:module.exports,require:name=>{
  if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name==='node:net')return require('node:net');
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name==='./content-cas'||name==='@/lib/workroom/content-cas')return load('lib/workroom/content-cas.ts');
  if(name==='./event-cas')return load('lib/workroom/event-cas.ts');
  throw Error('Unexpected import '+name);
 },process:{env},Buffer,structuredClone,Date:Clock,URL,AbortSignal,fetch,console:{error(){}},...globals});return module.exports;
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
test('concurrent store initialization shares one pool, schema failures are retried, and the failed pool is closed',async()=>{
 let pools=0,ended=0,fail=true;
 class Pool {constructor(){pools++;}async query(){if(fail)throw Error('Schema unavailable');return {rows:[]};}async end(){ended++;}}
 const store=load('lib/workroom/store.ts',{'pg':{Pool}},{DATABASE_URL:'postgres://fixture.invalid/test'});
 await assert.rejects(store.workroomDatabase());
 // Dropping the reference is not enough: the sockets it opened count against
 // the provider's connection limit and every retry would open another set.
 assert.equal(ended,1,'failed schema init must close its pool');
 fail=false;
 const result=await Promise.all([store.workroomDatabase(),store.workroomDatabase()]);
 assert.equal(pools,2);assert.equal(result[0],result[1]);assert.equal(ended,1,'a healthy pool is never closed');
});
test('a pool with no end() still reports the schema error rather than a TypeError',async()=>{
 // pg always has end(); a stand-in in another test might not, and swallowing
 // the original error behind "failed.end is not a function" would hide it.
 class Pool {async query(){throw Error('Schema unavailable');}}
 const store=load('lib/workroom/store.ts',{'pg':{Pool}},{DATABASE_URL:'postgres://fixture.invalid/test'});
 await assert.rejects(store.workroomDatabase(),/Schema unavailable/);
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
// Every parked API route that exists on disk, not a hand-kept list. A new
// route under app/api/ordering, app/api/kitchen or app/api/printer has to be
// covered by the host gate the moment it is written, and adding one without
// a matcher entry fails the assertion below rather than shipping an endpoint
// the client's own domain can call.
const PARKED_API_PATHS=(()=>{
 const found=[];
 const walk=(dir,url)=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   if(entry.isDirectory())walk(path.join(dir,entry.name),url+'/'+entry.name);
   else if(entry.name==='route.ts')found.push(url);
  }
 };
 for(const tree of ['ordering','kitchen','printer'])walk(path.join(__dirname,'../../app/api',tree),'/api/'+tree);
 return found.sort();
})();
const CLIENT_HOSTS=['copperac.com','www.copperac.com','copperac.vercel.app'];
test('client hosts cannot reach parked ordering APIs, kitchen or the pitch; pitch host retains the demo',()=>{
 class Response {constructor(body,options){this.status=options.status;}static next(){return {status:200};}static redirect(url){return {status:307,url:String(url)};}}
 const {proxy,config}=load('proxy.ts',{'next/server':{NextResponse:Response}});
 const request=(host,p)=>({headers:{get:()=>host},nextUrl:{pathname:p,clone:()=>new URL('https://'+host+p)}});
 // The gate only runs on paths the matcher selects, so an uncovered path is
 // an open path however the function body reads.
 const matchers=config.matcher.map(m=>new RegExp('^'+m.replace(/:path\*/,'.*').replace(/\//g,'\\/')+'$'));
 assert.ok(PARKED_API_PATHS.length>=9,'expected the parked API routes to still be on disk');
 for(const route of PARKED_API_PATHS)assert.ok(matchers.some(re=>re.test(route)),'proxy matcher does not cover '+route);
 for(const host of CLIENT_HOSTS){
  for(const route of PARKED_API_PATHS)assert.equal(proxy(request(host,route)).status,404,host+route);
  for(const page of ['/kitchen','/kitchen/orders','/pitch/copper-athletic-club','/pitch/jelly']){
   const answer=proxy(request(host,page));
   assert.equal(answer.status,307,host+page);
   assert.equal(new URL(answer.url).pathname,'/',host+page);
  }
 }
 // Nothing is parked on the pitch host: that is where the preserved tool lives.
 for(const route of [...PARKED_API_PATHS,'/kitchen','/pitch/jelly'])assert.equal(proxy(request('copperac.glazedweb.com',route)).status,200,route);
});
/* ---------------------------- intake (/api/inquiry) ----------------------------
   The contact and reserve forms are the club's only guest intake, nothing about
   an enquiry is persisted, and the only record is the email. So these tests care
   about two things: that a real enquiry leaves in one piece, and that no failure
   path ever reports success. docs/intake-trace-2026-09-17.md is the path in full.
*/
const INQUIRY_SITE={'@/lib/site':{SITE:{email:'fallback@example.invalid',url:'https://example.invalid'}}};
const INQUIRY_ENV={RESEND_API_KEY:'fixture-key',INQUIRY_FROM:'Copper <copper@example.invalid>',INQUIRY_TO:'reserve@example.invalid'};
const GUEST={first:'Fixture',last:'Person',email:'fixture@example.invalid',phone:'5551234567'};
const ACCEPTED={ok:true,status:200,text:async()=>'',json:async()=>({id:'msg_fixture'})};
// Every import beyond these two throws inside load(), which is the assertion
// that intake touches no store: a persisted enquiry would need one.
function intake({env=INQUIRY_ENV,answer=async()=>ACCEPTED,globals}={}){
 const calls=[];
 const route=load('app/api/inquiry/route.ts',{...next,...INQUIRY_SITE},env,async(url,opts)=>{
  calls.push({url,headers:opts.headers,signal:opts.signal,payload:JSON.parse(opts.body)});
  return answer(calls.length);
 },globals);
 return {send:fields=>route.POST({json:async()=>fields}),calls};
}
test('a reserve enquiry reaches the club inbox in one piece, with the guest as reply-to',async()=>{
 const {send,calls}=intake();
 const response=await send({variant:'reserve',...GUEST,eventType:'Fantasy draft',date:'2026-10-04',start:'18:00',guests:'24',message:'Twelve of us, and we want the wings.'});
 assert.equal(response.status,200);assert.equal(response.body.ok,true);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');
 assert.equal(calls[0].payload.from,'Copper <copper@example.invalid>');
 assert.deepEqual(calls[0].payload.to,['reserve@example.invalid']);
 assert.equal(calls[0].payload.reply_to,'fixture@example.invalid');
 assert.equal(calls[0].payload.subject,'Copper Reserve enquiry: Fantasy draft on 2026-10-04');
 for(const line of ['First name: Fixture','Phone: 5551234567','Guests: 24','Message: Twelve of us, and we want the wings.'])assert.ok(calls[0].payload.text.includes(line),line);
 // The club needs to know which form it came off; reserve and contact are
 // different conversations and land in the same inbox.
 assert.ok(calls[0].payload.text.endsWith('Sent from https://example.invalid/reserve'));
 // An empty optional field is left out rather than sent as a blank label.
 assert.equal(calls[0].payload.text.includes('End time:'),false);
});
test('a contact enquiry is labelled as one, and falls back to the site address when INQUIRY_TO is unset',async()=>{
 const {send,calls}=intake({env:{RESEND_API_KEY:'fixture-key',INQUIRY_FROM:'copper@example.invalid'}});
 assert.equal((await send({variant:'contact',...GUEST,subject:'Membership',message:'How much is it?'})).status,200);
 assert.equal(calls[0].payload.subject,'Website enquiry: Membership');
 assert.deepEqual(calls[0].payload.to,['fallback@example.invalid']);
 assert.ok(calls[0].payload.text.endsWith('Sent from https://example.invalid/contact'));
 // An unknown variant is contact, never reserve: the club reads a reserve
 // subject as a room booking with a date behind it.
 const plain=intake();await plain.send({variant:'something-else',...GUEST,subject:'Hours'});
 assert.equal(plain.calls[0].payload.subject,'Website enquiry: Hours');
});
test('a guest cannot break the subject or the body out of one line',async()=>{
 const {send,calls}=intake();
 await send({variant:'contact',...GUEST,subject:'Hours\r\nBcc: someone@example.invalid',message:'Line\u0000one\u007f'});
 assert.equal(/[\r\n]/.test(calls[0].payload.subject),false);
 assert.ok(calls[0].payload.subject.startsWith('Website enquiry: Hours'));
 assert.equal(calls[0].payload.text.includes('Bcc:'),true,'the text body may carry it, one labelled line is fine');
 assert.equal(/Message: Line one/.test(calls[0].payload.text),true);
});
test('a duplicate submit is one email; a different enquiry is a new one',async()=>{
 const fields={variant:'reserve',...GUEST,eventType:'Birthday',date:'2026-11-02',message:'Twenty people.'};
 const {send,calls}=intake();
 // Back-and-resubmit, a second tab, or a retry after the abort below: the
 // same content twice must not put two copies in the club's inbox.
 assert.equal((await send(fields)).body.ok,true);
 assert.equal((await send(fields)).body.ok,true);
 const key=calls[0].headers['idempotency-key'];
 assert.ok(key,'the Resend call must carry an idempotency key');
 assert.equal(calls[1].headers['idempotency-key'],key);
 assert.equal(key.includes(fields.message),false,'the key must not carry the guest\'s words in the clear');
 await send({...fields,message:'Thirty people now.'});
 assert.notEqual(calls[2].headers['idempotency-key'],key);
 // A contact enquiry that happens to read the same is still its own message.
 const other=intake();await other.send({variant:'contact',...GUEST,subject:'Birthday',message:'Twenty people.'});
 assert.notEqual(other.calls[0].headers['idempotency-key'],key);
});
test('inquiry never claims success without a provider acceptance ID',async()=>{
 const fields={...GUEST,message:'Controlled test'};
 for(const outcome of ['accepted','missing-id','provider-error','network-error']){
  const {send,calls}=intake({answer:async()=>{
   if(outcome==='network-error')throw Error('Offline');
   return {ok:outcome!=='provider-error',status:400,text:async()=>'',json:async()=>outcome==='accepted'?{id:'message'}:{}};
  }});
  const response=await send(fields);
  assert.ok(calls[0].signal,outcome);
  assert.equal(response.status,outcome==='accepted'?200:502,outcome);
  assert.equal(response.body.ok,outcome==='accepted',outcome);
 }
});
test('an unconfigured inbox refuses instead of sending, and never reports success',async()=>{
 for(const env of [{},{RESEND_API_KEY:'fixture-key'},{INQUIRY_FROM:'copper@example.invalid'},{RESEND_API_KEY:'   ',INQUIRY_FROM:'copper@example.invalid'}]){
  const {send,calls}=intake({env});
  const response=await send({...GUEST,message:'Controlled test'});
  assert.equal(response.status,503);assert.equal(response.body.ok,false);assert.equal(response.body.reason,'not_configured');
  assert.equal(calls.length,0,'nothing may be sent without both env values');
 }
});
test('malformed bodies are a 400, not a 500, and nothing leaves the building',async()=>{
 // Valid JSON that is not a form. Without the array and scalar guard the
 // field reads below would throw and the handler would answer 500, which the
 // form treats as a delivery failure and hands off to the mail app.
 const {send,calls}=intake();
 for(const body of [null,[],['first','Fixture'],'a string',42,true]){
  const response=await send(body);
  assert.equal(response.status,400,JSON.stringify(body));
  assert.equal(response.body.reason,'bad_request',JSON.stringify(body));
 }
 // Unparseable JSON: a truncated POST, or one sent with the wrong content type.
 let sent=0;
 const route=load('app/api/inquiry/route.ts',{...next,...INQUIRY_SITE},INQUIRY_ENV,async()=>{sent++;return ACCEPTED;});
 const broken=await route.POST({json:async()=>{throw Error('Unexpected end of JSON input');}});
 assert.equal(broken.status,400);assert.equal(broken.body.reason,'bad_request');
 assert.equal(sent,0);assert.equal(calls.length,0);
});
test('oversized fields are refused by name before the provider is called',async()=>{
 const long=n=>'x'.repeat(n);
 for(const [field,length] of [['message',4001],['subject',201],['first',201],['eventType',201]]){
  const {send,calls}=intake();
  const response=await send({variant:'contact',...GUEST,subject:'Hours',[field]:long(length)});
  assert.equal(response.status,422,field);assert.equal(response.body.reason,'too_long',field);
  assert.equal(response.body.field,field,field);assert.equal(calls.length,0,field);
 }
 // The ceilings themselves are usable: a real long message clears 4,000.
 const {send,calls}=intake();
 assert.equal((await send({variant:'contact',...GUEST,subject:long(200),message:long(4000)})).status,200);
 assert.equal(calls.length,1);
});
test('a missing or malformed field is the guest\'s to fix, and sends nothing',async()=>{
 const {send,calls}=intake();
 const missing=await send({variant:'contact',first:'Fixture',subject:'Hours'});
 assert.equal(missing.status,422);assert.equal(missing.body.reason,'missing_fields');
 // Copied out of the sandbox realm first; a cross-realm array is not deep-equal.
 assert.deepEqual([...missing.body.missing],['last','email','phone']);
 // Whitespace and control characters are not a name.
 assert.equal((await send({variant:'contact',...GUEST,first:' \u0001 '})).body.reason,'missing_fields');
 for(const email of ['fixture','fixture@','@example.invalid','fixture@example','fix ture@example.invalid'])
  assert.equal((await send({variant:'contact',...GUEST,email,subject:'Hours'})).body.reason,'bad_email',email);
 assert.equal(calls.length,0);
});
test('the send is abandoned after twelve seconds and the guest is never told it worked',async()=>{
 let requested=null;
 const timeoutSignal={aborted:false};
 const response=await intake({
  globals:{AbortSignal:{timeout(ms){requested=ms;return timeoutSignal;}}},
  answer:async()=>{
   // What AbortSignal.timeout produces when it fires: a DOMException, not an
   // Error, and it must land on the same refusal as an unreachable provider.
   const err=new Error('The operation was aborted due to timeout');err.name='TimeoutError';throw err;
  },
 }).send({variant:'reserve',...GUEST,eventType:'Draft night'});
 assert.equal(requested,12000,'the Resend call must carry the 12 second ceiling');
 assert.equal(response.status,502);assert.equal(response.body.ok,false);assert.equal(response.body.reason,'network_error');
});
