// Star CloudPRNT HTTP: Basic authentication identifies the device; the token
// query parameter identifies the exact job announced by POST. Never advance
// the queue merely because a DELETE arrived.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { configuredPrinters } from "@/lib/ordering/printing";
import { getStore } from "@/lib/ordering/store";
import { isPrintId, parsePrinterPoll, printerCode } from "@/lib/ordering/printer-jobs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
const response=(status:number,body:string|null=null)=>new NextResponse(body,{status,headers});
function printerFor(req:NextRequest){
 const auth=req.headers.get("authorization")??"";if(auth.length>2048 || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(auth))return null;
 const value=Buffer.from(auth.slice(6),"base64").toString("utf8"),colon=value.indexOf(":");if(colon<1)return null;
 const id=value.slice(0,colon),secret=value.slice(colon+1),printer=configuredPrinters().find(p=>p.id===id);
 if(!printer)return null;
 const digest=(s:string)=>createHash("sha256").update(s).digest();return timingSafeEqual(digest(secret),digest(printer.token))?printer:null;
}
function unauthorized(){return new NextResponse(null,{status:401,headers:{...headers,"WWW-Authenticate":'Basic realm="Kitchen printer", charset="UTF-8"'}});}
async function pollBody(req:Request):Promise<unknown>{
 if(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json" || !req.body)return null;
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return null;}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return null;}finally{reader.releaseLock();}
}
export async function POST(req:NextRequest){
 try{
  const printer=printerFor(req);if(!printer)return unauthorized();
  const store=getStore();if(store.backend!=="postgres")return response(503);
  const poll=parsePrinterPoll(await pollBody(req));if(!poll)return response(400);
  const job=await store.printerPoll(printer.id,poll);
  return NextResponse.json(job?{jobReady:true,jobToken:job.id,mediaTypes:["text/plain"],deleteMethod:"DELETE"}:{jobReady:false},{headers});
 }catch{return response(503);}
}
export async function GET(req:NextRequest){
 if(req.nextUrl.searchParams.has("delete"))return DELETE(req);
 try{
  const printer=printerFor(req);if(!printer)return unauthorized();
  const store=getStore();if(store.backend!=="postgres")return response(503);
  const token=req.nextUrl.searchParams.get("token");if(!isPrintId(token))return response(400);
  const type=req.nextUrl.searchParams.get("type");if(type && type!=="text/plain")return response(406);
  const result=await store.printerFetch(printer.id,token);
  if(result.status!==200 || !result.job)return response(result.status);
  return new NextResponse(result.job.body,{headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});
 }catch{return response(503);}
}
export async function DELETE(req:NextRequest){
 try{
  const printer=printerFor(req);if(!printer)return unauthorized();
  const store=getStore();if(store.backend!=="postgres")return response(503);
  const token=req.nextUrl.searchParams.get("token"),code=printerCode(req.nextUrl.searchParams.get("code"));
  if(!isPrintId(token)||!code)return response(400);
  const result=await store.printerConfirm(printer.id,token,printer.role,code);return response(result.status);
 }catch{return response(503);}
}
