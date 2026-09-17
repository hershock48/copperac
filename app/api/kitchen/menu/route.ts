import { NextRequest, NextResponse } from "next/server";
import { kitchenRole } from "@/lib/ordering/auth";
import { invalidateMenuCache, seedMenuDoc, validateMenuDoc } from "@/lib/ordering/menu";
import { menuRevision } from "@/lib/ordering/menu-document-store";
import { getStore, type OrderStore } from "@/lib/ordering/store";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
async function snapshot(store:OrderStore){
 const record=await store.getMenuRecord(),doc=record?.doc??seedMenuDoc();
 if(validateMenuDoc(doc))throw Error("Invalid saved menu");
 return {record,doc,revision:menuRevision(record,doc)};
}
export async function GET(){
 const role=await kitchenRole();if(role!=="owner")return reply({error:"Owner sign-in is required to edit the demo menu."},role?403:401);
 try {const store=getStore(),state=await snapshot(store);return reply({ok:true,doc:state.doc,revision:state.revision,backend:store.backend,history:await store.menuHistory()});}
 catch{return reply({error:"The saved menu could not be loaded. Your draft has not been changed."},503);}
}
async function readBody(req:Request):Promise<unknown>{
 if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/json" || !req.body)return null;
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288){await reader.cancel();return null;}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
 catch{return null;}finally{reader.releaseLock();}
}
export async function PUT(req:NextRequest){
 const role=await kitchenRole();if(role!=="owner")return reply({error:"Owner sign-in is required to edit the demo menu."},role?403:401);
 try{
  const store=getStore();if(process.env.NODE_ENV==="production" && store.backend!=="postgres")return reply({error:"Persistent storage is required. This menu has not been saved."},503);
  const raw=await readBody(req);
  if(!raw || typeof raw!=="object" || Array.isArray(raw))return reply({error:"A complete menu and saved revision are required."},400);
  const body=raw as Record<string,unknown>;
  if(Object.keys(body).some(k=>!["doc","revision"].includes(k)) || typeof body.revision!=="string" || !/^[a-f0-9]{64}$/.test(body.revision))return reply({error:"Refresh the menu in another tab and compare it before saving."},400);
  const problem=validateMenuDoc(body.doc);if(problem)return reply({error:problem},400);
  const current=await snapshot(store);
  if(current.revision!==body.revision)return reply({error:"The saved menu changed. Compare the latest copy before saving."},409);
  const saved=await store.compareMenuDoc(current.record,body.doc,current.doc);
  if(!saved)return reply({error:"Another save arrived first. Compare the latest copy before saving."},409);
  invalidateMenuCache();
  return reply({ok:true,doc:saved.doc,revision:menuRevision(saved,saved.doc),backend:store.backend,history:await store.menuHistory()});
 }catch{return reply({error:"This save could not be confirmed. Keep your draft and check the latest saved menu before retrying."},503);}
}
