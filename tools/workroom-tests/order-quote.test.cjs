const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
// Actual client source; isolated dependencies. No .env, provider or network use.
function load(file, mocks = {}, env = {}) {
 const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new vm.Script(compiled,{filename:file}).runInNewContext({module,exports:module.exports,crypto:require('node:crypto').webcrypto,process:{env},Buffer,structuredClone,Response,Request,URL,console,require(name){if(Object.hasOwn(mocks,name))return mocks[name];if(name==='./notification-outbox')return load('lib/ordering/notification-outbox.ts');if(name==='./printer-jobs')return load('lib/ordering/printer-jobs.ts');if(name==='./menu-document-fields')return load('lib/ordering/menu-document-fields.ts');if(name==='./menu-document-store')return load('lib/ordering/menu-document-store.ts');if(name==='../workroom/content-cas')return load('lib/workroom/content-cas.ts');if(name==='node:crypto')return require('node:crypto');throw Error('Unexpected dependency: '+name);}});
 return module.exports;
}
const acceptance=load('lib/ordering/order-acceptance.ts');
const q=load('lib/ordering/order-quote.ts'), pricing=load('lib/ordering/pricing.ts');
const clean=x=>JSON.parse(JSON.stringify(x));
const item=(patch={})=>({id:'food-burger',name:'Burger',priceCents:1000,ageRestricted:false,options:[],...patch});
const line=(patch={})=>({itemId:'food-burger',qty:1,options:[],quotedUnitCents:1000,quotedAgeRestricted:false,...patch});
const quote=(lines=[line()],items=[item()],config={})=>q.quoteOrder(lines,new Map(items.map(i=>[i.id,i])),[],{feeCents:99,tipCents:0,taxBasisPoints:600,...config},pricing.priceOptions);
test('exact half-up cents, tip bounds and overflow do not round or coerce inputs',()=>{
 assert.deepEqual(clean(q.orderTotals(25,0,0,600)),{subtotalCents:25,feeCents:0,tipCents:0,taxCents:2,totalCents:27});
 assert.equal(q.orderTotals(24,0,0,600).taxCents,1);
 for(const qty of [0,-1,1.5,'1',true,null,NaN,Infinity,13,Number.MAX_SAFE_INTEGER])assert.equal(quote([line({qty})]).ok,false,String(qty));
 for(const tipCents of [-1,.5,'100',true,null,undefined,NaN,Infinity,2001])assert.equal(quote(undefined,undefined,{tipCents}).ok,false,String(tipCents));
 assert.equal(quote(undefined,undefined,{tipCents:2000}).ok,true);
 assert.equal(q.orderTotals(Number.MAX_SAFE_INTEGER,1,0,0),null);
 assert.equal(quote([line({qty:12})],[item({priceCents:Number.MAX_SAFE_INTEGER})]).ok,false);
 assert.equal(q.orderTotals(10,0,0,10001),null);
});
test('cart identities preserve option combinations even when names contain separators',()=>{
 const first=[{group:'A',choice:'B,C=D'}],second=[{group:'A',choice:'B'},{group:'C',choice:'D'}];
 assert.notEqual(q.orderLineKey('item',first),q.orderLineKey('item',second));
 assert.equal(q.orderLineKey('item',second),q.orderLineKey('item',[...second].reverse()));
});
test('malformed carts, catalog ambiguity, duplicate picks and duplicate lines are refused',()=>{
 for(const lines of [null,{},[],[null],[{}],Array.from({length:31},()=>line()),[line(),line()]])assert.equal(quote(lines).ok,false);
 const group={name:'Sauce',required:true,multi:true,choices:[{name:'Queso',priceCents:250}]};
 const options=[{group:'Sauce',choice:'Queso'}];
 assert.equal(quote([line({options})],[item({options:[group]})]).quote.lines[0].unitCents,1250);
 for(const picks of [[],['Queso'],[null],[...options,...options],[{group:'Wrong',choice:'Queso'}]])assert.equal(quote([line({options:picks})],[item({options:[group]})]).ok,false);
 for(const options of [[group,group],[{...group,choices:[...group.choices,...group.choices]}]])assert.equal(quote([line()],[item({options})]).status,503);
 const sameNames=[group,{...group,name:'Extra',choices:[{name:'Queso',priceCents:50}]}];
 assert.equal(quote([line({options:[...options,{group:'Extra',choice:'Queso'}]})],[item({options:sameNames})]).quote.lines[0].unitCents,1300);
});
test('review requires every displayed line price, age requirement and each total; malformed replies cannot replace cart',()=>{
 const lines=[line(),line({itemId:'food-fries',quotedUnitCents:500})],items=[item(),item({id:'food-fries',name:'Fries',priceCents:500})];
 const good=quote(lines,items).quote;
 assert.equal(q.quoteWasReviewed(lines,good.totals,good),true);assert.equal(q.isQuoteForSubmission(good,lines),true);
 const swapped=quote(lines,[item({priceCents:900}),item({id:'food-fries',name:'Fries',priceCents:600})]).quote;
 assert.equal(swapped.totals.totalCents,good.totals.totalCents);assert.equal(q.quoteWasReviewed(lines,good.totals,swapped),false);
 assert.equal(q.quoteWasReviewed([line({quotedAgeRestricted:undefined}),lines[1]],good.totals,good),false);
 for(const changed of [null,{...good,lines:[]},{...good,hasAlcohol:true},{...good,totals:{...good.totals,totalCents:1}},{...good,lines:[{...good.lines[0],lineCents:1},good.lines[1]]}])assert.equal(q.isQuoteForSubmission(changed,lines),false);
});
function harness() {
 let doc=[{name:'Food',ageRestricted:false,items:[{id:'food-burger',name:'Burger',desc:'Fixture',priceCents:1000,image:null,groups:[]}]}];
 const effects={tickets:0,orders:[],prints:0,emails:0};
 const bag={attempts:new Map(),orders:new Map(),printJobs:[],confirmations:new Map()};
 const store={getAttempt:async id=>bag.attempts.get(id)??null,settleAttempt:async(a,o,j)=>{const r=acceptance.settleMemory(bag,a,o,j);if(r.created&&o){effects.orders.push(o);effects.prints+=(j??[]).length;}return r;},claimConfirmation:async()=>true,backend:'postgres',getState:async()=>({unavailable:[],busyMinutes:0,pausedUntil:null}),getMenuDoc:async()=>structuredClone(doc),nextTicketNumber:async()=>++effects.tickets,createOrder:async o=>effects.orders.push(o),enqueuePrintJob:async()=>effects.prints++};
 // This is Copper's menu adapter even in a renamed scratch checkout.
 const menu=load('lib/ordering/menu.ts',{'./toast-menu.json':{default:doc}});
 const env={NODE_ENV:'production',STRIPE_SECRET_KEY:'fixture-does-not-activate-payment'};
 const time={orderingWindow:()=>({open:true})};
 const config={ORDERING:{feeCents:99,taxBasisPoints:600,basePickupMinutes:15}};
 const mocks={'next/server':{NextResponse:{json:Response.json}},'@/lib/ordering/config':config,'@/lib/ordering/menu':menu,'@/lib/ordering/pricing':pricing,'@/lib/ordering/order-quote':q,'@/lib/ordering/order-acceptance':acceptance,'@/lib/ordering/time':time,'@/lib/ordering/store':{getStore:()=>store,effectiveState:s=>s},'@/lib/ordering/printing':{configuredPrinters:()=>[{id:'fixture',role:'kitchen'}],renderFor:()=> 'fixture-ticket'},'@/lib/ordering/email':{sendOrderConfirmation:async()=>effects.emails++}};
 const route=load('app/api/ordering/order/route.ts',mocks,env);
 const body=(patch={})=>({attemptId:require('node:crypto').randomUUID(),guestName:'Fixture',guestPhone:'2025550123',guestEmail:'',tipCents:0,lines:[line()],expectedTotals:quote().quote.totals,...patch});
 const post=async b=>route.POST(new Request('https://fixture.invalid/api/ordering/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}));
 return {store,effects,menu,post,body,mocks,env,time,changePrice(cents){doc[0].items[0].priceCents=cents;},hide(){doc[0].items[0].hidden=true;}};
}
test('warm page cache cannot authorize stale checkout prices; review is free of order/ticket/print/email effects',async()=>{
 const h=harness();assert.equal((await h.menu.guestMenu(h.store)).index.get('food-burger').priceCents,1000);
 h.changePrice(1200);assert.equal((await h.menu.guestMenu(h.store)).index.get('food-burger').priceCents,1000);
 const response=await h.post(h.body());assert.equal(response.status,409);const changed=await response.json();assert.equal(changed.priceChanged,true);assert.equal(changed.quote.lines[0].unitCents,1200);
 assert.deepEqual(h.effects,{tickets:0,orders:[],prints:0,emails:0});
 const accepted=await h.post(h.body({lines:[line({quotedUnitCents:1200})],expectedTotals:changed.quote.totals}));
 assert.equal(accepted.status,200);const receipt=await accepted.json();assert.equal(receipt.totals.totalCents,1377);assert.equal(receipt.quote.lines[0].unitCents,1200);
 assert.equal(h.effects.orders.length,1);assert.equal(h.effects.prints,1);assert.equal(h.effects.emails,0);assert.equal(h.effects.orders[0].paid,false);
});
test('hidden/sold-out/paused/offline-storage cases stop before accepting anything',async()=>{
 for(const mode of ['hidden','sold-out','paused','memory','menu-failed','closed']){
  const h=harness();await h.menu.guestMenu(h.store);
  if(mode==='hidden')h.hide();
  if(mode==='sold-out')h.store.getState=async()=>({unavailable:['food-burger'],busyMinutes:0,pausedUntil:null});
  if(mode==='paused')h.store.getState=async()=>({unavailable:[],busyMinutes:0,pausedUntil:Date.now()+60000});
  if(mode==='memory')h.store.backend='memory';
  if(mode==='menu-failed')h.menu.guestMenu=async()=>{throw Error('fixture offline');};
  if(mode==='closed')h.time.orderingWindow=()=>({open:false,reason:'Closed'});
  const response=await h.post(h.body());assert.equal(response.status,['memory','menu-failed'].includes(mode)?503:409,mode);assert.deepEqual(h.effects,{tickets:0,orders:[],prints:0,emails:0});
 }
});
test('malformed requests, forged totals and legacy requests fail before writes; provider keys do not turn a demo into live payments',async()=>{
 const h=harness();
 for(const body of [null,[],{},h.body({guestName:123}),h.body({payAtPickup:'true'}),h.body({tipCents:'0'}),h.body({lines:[line({qty:1.5})]})])assert.equal((await h.post(body)).status,400);
 for(const body of [h.body({expectedTotals:undefined}),h.body({expectedTotals:{...quote().quote.totals,totalCents:1}}),h.body({lines:[line({quotedUnitCents:1})]})])assert.equal((await h.post(body)).status,409);
 assert.deepEqual(h.effects,{tickets:0,orders:[],prints:0,emails:0});
 const state=load('app/api/ordering/state/route.ts',h.mocks,h.env);assert.equal((await (await state.GET()).json()).demo,true);
 h.store.backend='memory';assert.equal((await (await state.GET()).json()).open,false);
});
