"use client";
import {useEffect,useRef,useState} from "react";
import type {CloseCommand,NotificationView} from "@/lib/ordering/notification-outbox";
import {notificationIssue,notificationLabel,notificationReviewRequest} from "@/lib/ordering/notification-request";
export default function NotificationInbox(){
 const [items,setItems]=useState<NotificationView[]>([]),[count,setCount]=useState(0),[enabled,setEnabled]=useState(false),[canCheck,setCanCheck]=useState(false),[configuration,setConfiguration]=useState(""),[notice,setNotice]=useState(""),[loadError,setLoadError]=useState(""),[busy,setBusy]=useState(false),[selected,setSelected]=useState<NotificationView|null>(null),[reason,setReason]=useState(""),[pending,setPending]=useState<CloseCommand|null>(null);
 const mounted=useRef(false),flight=useRef(false),pendingRef=useRef<CloseCommand|null>(null),sequence=useRef(0);
 async function refresh(){
  const turn=++sequence.current;
  try{const response=await fetch("/api/kitchen/notifications",{cache:"no-store",signal:AbortSignal.timeout(12000)}),data=await response.json();if(!mounted.current||turn!==sequence.current)return;
   if(!response.ok||!Array.isArray(data.items)||!Number.isInteger(data.count)||typeof data.enabled!=="boolean")throw Error();
   setItems(data.items);setCount(data.count);setEnabled(data.enabled);setCanCheck(data.canCheck===true);setConfiguration(data.message??"");setLoadError("");
  }catch{if(mounted.current&&turn===sequence.current)setLoadError("Email status could not refresh. Displayed values may be older; check your connection and owner sign-in.");}
 }
 useEffect(()=>{mounted.current=true;const requests=sequence,first=setTimeout(refresh,0),timer=setInterval(refresh,15000);return()=>{mounted.current=false;requests.current++;clearTimeout(first);clearInterval(timer);};},[]);
 async function run(action:"dispatch"|"check",orderId?:string){
  if(flight.current||pendingRef.current)return;flight.current=true;setBusy(true);setNotice("");
  try{const response=await fetch("/api/kitchen/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...(orderId?{orderId}:{})}),signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok||data.ok!==true)throw Error();if(mounted.current)setNotice(String(data.message??"Check the saved status below."));}
  catch{if(mounted.current)setNotice("The response was lost or the action was refused. Refresh the saved status. Running due confirmations again uses their existing messages and retry limits.");}
  finally{flight.current=false;if(mounted.current){setBusy(false);void refresh();}}
 }
 async function close(command:CloseCommand,check=false){
  if(flight.current)return;flight.current=true;pendingRef.current=command;setPending(command);setBusy(true);setNotice("");
  const result=await notificationReviewRequest(command,check);flight.current=false;if(!mounted.current)return;setBusy(false);
  if(!result){setNotice("The review result is unknown. Check its saved result or retry the same review. Keep this page open to retain recovery controls.");return;}
  pendingRef.current=null;setPending(null);setNotice(result.message);if(result.outcome==="saved"){setSelected(null);setReason("");}void refresh();
 }
 return <details className="mb-5 rounded-sm border p-4 text-sm" style={{overflowWrap:"anywhere"}}>
  <summary className="min-h-9 cursor-pointer font-semibold">Guest order emails{count?" · "+count:""}</summary>
  <section aria-label="Guest order emails">
   <p className="mt-2">These are courtesy confirmations. Email status does not change fulfillment or payment. A provider acceptance is not delivery; a mail-server acceptance does not prove the guest read it.</p>
   {configuration&&<p className="mt-2">{configuration}</p>}{loadError&&<p role="alert" className="mt-2">{loadError}</p>}
   <div className="my-3 flex flex-wrap gap-2"><button type="button" className="min-h-11 border px-3 disabled:opacity-50" disabled={busy||!!pending} onClick={()=>void refresh()}>Refresh email status</button><button type="button" className="min-h-11 border px-3 disabled:opacity-50" disabled={!enabled||busy||!!pending} onClick={()=>void run("dispatch")}>Run due confirmations</button></div>
   <p>Run due confirmations processes up to two eligible messages and two provider checks. It does not create another copy of an accepted email. Older or unresolved attempts need review; nothing is resent after the retry limit.</p>
   <ul className="mt-3 space-y-4">{items.map(item=><li key={item.orderId} className="border-t pt-3">
    <p className="font-semibold">Order {item.number===null?"unknown":"#"+item.number} · {notificationLabel(item)}</p><p>{item.recipient}</p>
    {item.providerId&&<p>Provider reference: {item.providerId}</p>}
    <p>Attempts: {item.attempts}{item.checkedAt?" · Last provider check: "+new Date(item.checkedAt).toLocaleString():""}{item.nextAttemptAt?" · Next eligible retry: "+new Date(item.nextAttemptAt).toLocaleString():""}</p>
    {(item.errorCode||item.checkError)&&<p>{notificationIssue((item.checkError||item.errorCode)!)}</p>}
    <div className="mt-2 flex flex-wrap gap-2">{item.providerId&&<button type="button" className="min-h-11 border px-3 disabled:opacity-50" disabled={!canCheck||busy||!!pending} onClick={()=>void run("check",item.orderId)}>Check provider result</button>}
    <button type="button" className="min-h-11 border px-3 disabled:opacity-50" disabled={busy||!!pending} onClick={()=>{if(selected?.orderId!==item.orderId)setReason("");setSelected(item);setNotice("");}}>Record manual follow-up</button></div>
   </li>)}</ul>
   {count>items.length&&<p className="mt-3">Showing {items.length} of {count} confirmations, with review issues first. Closing reviewed issues reveals more records.</p>}
   {!count&&!loadError&&<p className="mt-3">No open email records. Orders without an email address do not create a confirmation.</p>}
   {selected&&!pending&&<form className="mt-4 space-y-2" onSubmit={e=>{e.preventDefault();if(flight.current||pendingRef.current)return;void close({operationId:crypto.randomUUID(),orderId:selected.orderId,revision:selected.revision,reason});}}>
    <p>Close the email issue for order {selected.number===null?"unknown":"#"+selected.number}. You take responsibility for any follow-up. This stops future sending attempts; it cannot recall an email already sent and makes no delivery claim.</p>
    <label className="block">Follow-up note<input required maxLength={240} className="mt-1 block w-full bg-white p-2 text-black" value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <button type="submit" className="min-h-11 border px-3 disabled:opacity-50" disabled={busy||!reason.trim()}>Save manual follow-up</button><button type="button" className="ml-2 min-h-11 border px-3" onClick={()=>setSelected(null)}>Keep issue open</button>
   </form>}
   {pending&&<div className="mt-4"><p>Review reference: {pending.operationId}</p><button type="button" className="min-h-11 border px-3 disabled:opacity-50" disabled={busy} onClick={()=>void close(pending,true)}>Check saved review</button><button type="button" className="ml-2 min-h-11 border px-3 disabled:opacity-50" disabled={busy} onClick={()=>void close(pending)}>Retry same review</button></div>}
   {notice&&<p role="status" className="mt-3">{notice}</p>}
  </section>
 </details>;
}
