// Route tests for the guest intake (/api/inquiry) and the host gate (proxy.ts).
// Run with `node --test lib/__tests__/intake.cjs`.
//
// Brought over from the closed intake-trace branch (hershock48/copperac#7) on
// 15 Oct 2026, trimmed of the pieces that belonged to the launch-readiness
// branch (#1) main never took: the signed-session, login-limit and CAS tests
// and their loader shims. What is left is what still holds on main: a real
// enquiry leaves in one piece, no failure path ever reports success, a
// duplicate submit is one email, and the parked ordering APIs stay behind the
// proxy on every client host.
//
// The loader compiles a TypeScript route in a sandbox with only the imports
// each test mocks. Any other import throws, which is how these tests also
// prove the inquiry route reaches nothing it should not: it loads with
// next/server and @/lib/site mocked and nothing else, so it cannot be touching
// the store.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
// `globals` overrides one of the sandbox globals below, so a test can watch
// what the module under test asks the platform for (AbortSignal.timeout).
function load(file,mocks={},env={},fetch,globals={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new vm.Script(code).runInNewContext({module,exports:module.exports,require:name=>{
  if(name==='server-only')return {};if(name==='node:crypto')return crypto;
  if(Object.hasOwn(mocks,name))return mocks[name];
  throw Error('Unexpected import '+name);
 },process:{env},Buffer,structuredClone,Date,URL,AbortSignal,fetch,console:{error(){}},...globals});return module.exports;
}
const json=(body,options={})=>({status:options.status||200,body,headers:options.headers});
const next={'next/server':{NextResponse:{json}}};

/* ------------------------------ the host gate ------------------------------ */
const PARKED_API_TREES=['ordering','kitchen','printer'];
// Next serves route.ts, route.tsx, route.js, route.jsx, route.mjs and route.cjs
// alike, so the walk matches all six: a handler written in any of them is
// reachable on copperac.com unless the proxy covers it.
const ROUTE_FILE=/^route\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PARKED_API=(()=>{
 const found=[],missing=[];
 const walk=(dir,url)=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   if(entry.isDirectory())walk(path.join(dir,entry.name),url+'/'+entry.name);
   else if(ROUTE_FILE.test(entry.name))found.push(url);
  }
 };
 for(const tree of PARKED_API_TREES){
  const dir=path.join(__dirname,'../../app/api',tree);
  // A tree somebody removed is a finding of its own, named by the test,
  // rather than an ENOENT thrown while this file was still loading.
  if(!fs.existsSync(dir)){missing.push(tree);continue;}
  walk(dir,'/api/'+tree);
 }
 return {paths:[...new Set(found)].sort(),missing};
})();
const CLIENT_HOSTS=['copperac.com','www.copperac.com','copperac.vercel.app'];
test('client hosts cannot reach parked ordering APIs, kitchen or the pitch; pitch host retains the demo',()=>{
 class Response {constructor(body,options){this.status=options.status;}static next(){return {status:200};}static redirect(url){return {status:307,url:String(url)};}}
 const {proxy,config}=load('proxy.ts',{'next/server':{NextResponse:Response}});
 const request=(host,p)=>({headers:{get:()=>host},nextUrl:{pathname:p,clone:()=>new URL('https://'+host+p)}});
 // The gate only runs on paths the matcher selects, so an uncovered path is
 // an open path however the function body reads.
 const matchers=config.matcher.map(m=>new RegExp('^'+m.replace(/:path\*/,'.*').replace(/\//g,'\\/')+'$'));
 assert.deepEqual(PARKED_API.missing,[],'parked API tree missing from disk: '+PARKED_API.missing.join(', '));
 for(const name of ['route.ts','route.tsx','route.js','route.jsx','route.mjs','route.cjs'])assert.ok(ROUTE_FILE.test(name),name);
 for(const name of ['route.ts.bak','routes.ts','my-route.ts','route.test.ts','route.md'])assert.equal(ROUTE_FILE.test(name),false,name);
 // Seven parked routes on main as of 15 Oct 2026 (ordering: order, state;
 // kitchen: login, menu, orders, state; printer). The floor catches a tree
 // going missing, not a route being added.
 assert.ok(PARKED_API.paths.length>=7,'expected the parked API routes to still be on disk, found '+PARKED_API.paths.join(', '));
 for(const route of PARKED_API.paths)assert.ok(matchers.some(re=>re.test(route)),'proxy matcher does not cover '+route);
 for(const host of CLIENT_HOSTS){
  for(const route of PARKED_API.paths)assert.equal(proxy(request(host,route)).status,404,host+route);
  for(const page of ['/kitchen','/kitchen/orders','/pitch/copper-athletic-club','/pitch/jelly']){
   const answer=proxy(request(host,page));
   assert.equal(answer.status,307,host+page);
   assert.equal(new URL(answer.url).pathname,'/',host+page);
  }
 }
 // Nothing is parked on the pitch host: that is where the preserved tool lives.
 for(const route of [...PARKED_API.paths,'/kitchen','/pitch/jelly'])assert.equal(proxy(request('copperac.glazedweb.com',route)).status,200,route);
});

/* ---------------------------- intake (/api/inquiry) ----------------------------
   The contact and reserve forms are the club's only guest intake, nothing about
   an enquiry is persisted, and the only record is the email. So these tests care
   about two things: that a real enquiry leaves in one piece, and that no failure
   path ever reports success. */
// The formatter is loaded through the same sandbox (no imports of its own), so
// the route's import of it is the real module, not a stand-in.
const FORMAT=load('lib/inquiry-format.ts');
const INQUIRY_SITE={'@/lib/site':{SITE:{email:'fallback@example.invalid',url:'https://example.invalid'}},'@/lib/inquiry-format':FORMAT};
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
 // Spelled out, not the form's own 2026-10-04 / 18:00 (Abbie, 20 Oct 2026).
 assert.equal(calls[0].payload.subject,'Copper Reserve enquiry: Fantasy draft on Sunday, October 4, 2026');
 for(const line of ['First name: Fixture','Phone: 5551234567','Event date: Sunday, October 4, 2026','Start time: 6:00 PM','Guests: 24','Message: Twelve of us, and we want the wings.'])assert.ok(calls[0].payload.text.includes(line),line);
 // The HTML part is the same rows as a table, with the guest to reply to.
 const html=calls[0].payload.html;
 assert.ok(html.startsWith('<!doctype html>'));
 for(const piece of ['<table','>Event date<','>Sunday, October 4, 2026<','>Start time<','>6:00 PM<','mailto:fixture@example.invalid','https://example.invalid/reserve'])assert.ok(html.includes(piece),piece);
 assert.equal(html.includes('End time'),false);
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
 // Nor inject markup into the HTML part.
 const {send:send2,calls:calls2}=intake();
 await send2({variant:'contact',...GUEST,first:'<b>Bold</b>',subject:'Hours',message:'<script>alert(1)</script> & "quotes"'});
 assert.equal(calls2[0].payload.html.includes('<script>'),false);
 assert.ok(calls2[0].payload.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;'));
 assert.ok(calls2[0].payload.html.includes('&lt;b&gt;Bold&lt;/b&gt;'));
});

test('dates and times read like a person wrote them, and odd input passes through untouched',()=>{
 const {formatEventDate:d,formatEventTime:t}=FORMAT;
 assert.equal(d('2026-12-14'),'Monday, December 14, 2026');
 assert.equal(d('2026-10-04'),'Sunday, October 4, 2026');
 assert.equal(d('2026-02-31'),'2026-02-31');
 assert.equal(d('December 14'),'December 14');
 assert.equal(t('17:30'),'5:30 PM');assert.equal(t('09:05'),'9:05 AM');assert.equal(t('00:00'),'12:00 AM');assert.equal(t('12:00'),'12:00 PM');
 assert.equal(t('5:30 PM'),'5:30 PM');assert.equal(t('25:00'),'25:00');
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
