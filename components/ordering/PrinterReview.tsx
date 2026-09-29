"use client";
import { useEffect,useRef,useState } from "react";
import type { PrintCommand,PrintIssue } from "@/lib/ordering/printer-jobs";
import { requestPrintReview } from "@/lib/ordering/printer-review";
export default function PrinterReview({issues,count,owner,printers,onSaved}:{issues:PrintIssue[];count:number;owner:boolean;printers:{id:string;label:string}[];onSaved:()=>void}){
 const [selected,setSelected]=useState<PrintIssue|null>(null),[mode,setMode]=useState<PrintCommand["mode"]>("skip"),[reason,setReason]=useState(""),[notice,setNotice]=useState(""),[pending,setPending]=useState<PrintCommand|null>(null),[busy,setBusy]=useState(false);
 const flight=useRef(false),mounted=useRef(false),pendingRef=useRef<PrintCommand|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function send(command:PrintCommand,check=false){
  if(flight.current)return;flight.current=true;pendingRef.current=command;setPending(command);setBusy(true);setNotice("");
  const result=await requestPrintReview(command,check);flight.current=false;if(!mounted.current)return;setBusy(false);
  if(!result){setNotice("The result is unknown. Check the saved result or retry this same review. Keep this page open; reloading loses the recovery controls.");return;}
  pendingRef.current=null;setPending(null);setNotice(result.message);setSelected(null);setReason("");onSaved();
 }
 if(!count&&!pending&&!notice&&!selected)return null;
 return <section aria-label="Printer ticket status" className="mb-5 rounded-sm border p-4 text-sm" style={{overflowWrap:"anywhere"}}>
  <h2 className="mb-2 font-semibold">Printer ticket status</h2>
  <p>A recent connection does not prove a ticket printed. Check the paper and the order before replacing a ticket.</p>
  <ul className="mt-3 space-y-3">{issues.map(j=><li key={j.id}>Order {j.orderNumber===null?"unknown":"#"+j.orderNumber} · {printers.find(p=>p.id===j.printerId)?.label||j.printerId} · {j.status==="fetched"?"Awaiting print confirmation":j.status==="expired"?"Not fetched before deadline":"Print failed or was stopped"}{j.resultCode?" · "+j.resultCode:""}
   {owner&&<button type="button" disabled={!!pending||busy} className="ml-2 min-h-11 border px-3 disabled:opacity-50" onClick={()=>{setSelected(j);setReason("");setMode("skip");setNotice("");}}>Review ticket</button>}
  </li>)}</ul>
  {count>issues.length&&<p className="mt-2">Showing {issues.length} of {count} unresolved tickets, with held tickets first. Resolving these reveals the next tickets.</p>}
  {!owner&&count>0&&<p className="mt-3">An owner can review these tickets. A ticket awaiting confirmation holds the next ticket for that printer.</p>}
  {owner&&selected&&!pending&&<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();if(pendingRef.current||flight.current)return;void send({operationId:crypto.randomUUID(),printerId:selected.printerId,jobId:selected.id,revision:selected.revision,mode,reason});}}>
   <p className="font-semibold">Review order {selected.orderNumber===null?"unknown":"#"+selected.orderNumber}</p>
   <label className="block">What did you check?<select className="mt-1 block w-full bg-white p-2 text-black" value={mode} onChange={e=>setMode(e.target.value as PrintCommand["mode"])}>
    <option value="skip">Close this ticket; handle the order on screen</option><option value="confirm_printed">I checked the paper: this ticket printed</option><option value="reprint">Queue a replacement; duplicate paper is possible</option>
   </select></label>
   <p>{mode==="reprint"?"Stop or clear the old job on the printer first. A replacement cannot recall paper already printed and may wait behind other queued orders.":mode==="confirm_printed"?"Your physical check is recorded. A kitchen ticket also accepts an order that is still new.":"Closes this print issue without accepting or cancelling the order. Handle fulfillment on screen."}</p>
   <label className="block">Reason or physical check<input className="mt-1 block w-full bg-white p-2 text-black" value={reason} required maxLength={240} onChange={e=>setReason(e.target.value)}/></label>
   <button type="submit" disabled={!reason.trim()} className="min-h-11 border px-3 disabled:opacity-50">Record review</button><button type="button" className="ml-2 min-h-11 border px-3" onClick={()=>setSelected(null)}>Cancel review</button>
  </form>}
  {pending&&<div className="mt-4 space-y-2"><p>Review reference: {pending.operationId}</p><p>{busy?"Checking the saved result…":"Keep this reference until the result is known."}</p><button type="button" disabled={busy} className="min-h-11 border px-3 disabled:opacity-50" onClick={()=>void send(pending,true)}>Check saved result</button><button type="button" disabled={busy} className="ml-2 min-h-11 border px-3 disabled:opacity-50" onClick={()=>void send(pending)}>Retry same review</button></div>}
  {notice&&<p role="status" className="mt-3">{notice}</p>}
 </section>;
}
