import { NextRequest } from "next/server";
import { kitchenRole } from "@/lib/ordering/auth";
import { getStore } from "@/lib/ordering/store";
import { notificationConfiguration,checkOrderNotification,runNotificationQueue } from "@/lib/ordering/email";
import { isNotificationId,parseCloseCommand } from "@/lib/ordering/notification-outbox";
import { kitchenReply } from "@/lib/ordering/kitchen-service";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=60;
export async function GET(req:NextRequest){
 if(await kitchenRole()!=="owner")return kitchenReply({error:"Owner sign-in is required."},403);
 try{const store=getStore();if(store.backend!=="postgres")return kitchenReply({items:[],count:0,enabled:false,canCheck:false,message:"Persistent notification storage is required."});
 const reference=req.nextUrl.searchParams.get("review");if(reference){if(!isNotificationId(reference))return kitchenReply({error:"Invalid review reference."},400);const result=await store.getNotificationReview(reference);return result?kitchenReply(result):kitchenReply({error:"No saved review result yet."},202);}
 const config=notificationConfiguration();return kitchenReply({...await store.notificationList(),enabled:config.enabled,canCheck:!!config.key,message:config.reason});
 }catch{return kitchenReply({error:"Notification status could not be checked."},503);}
}
export async function POST(req:NextRequest){
 if(await kitchenRole()!=="owner")return kitchenReply({error:"Owner sign-in is required."},403);
 try{
  if(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||!req.body)return kitchenReply({error:"A JSON action is required."},400);
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0,raw:unknown;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return kitchenReply({error:"Request too large."},413);}chunks.push(value);}raw=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return kitchenReply({error:"Invalid action."},400);}finally{reader.releaseLock();}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return kitchenReply({error:"Invalid action."},400);
  const v=raw as Record<string,unknown>,keys=Object.keys(v).sort().join(","),store=getStore();if(store.backend!=="postgres")throw Error();
  if(v.action==="close"&&keys==="action,command"){
   const command=parseCloseCommand(v.command);if(!command)return kitchenReply({error:"Use the current confirmation and a reason (up to 240 characters)."},400);
   const result=await store.closeNotification(command);return kitchenReply(result,result.status);
  }
  if(v.action==="dispatch"&&keys==="action")return kitchenReply({ok:true,...await runNotificationQueue()});
  if(v.action==="check"&&keys==="action,orderId"&&isNotificationId(v.orderId)){await checkOrderNotification(v.orderId);return kitchenReply({ok:true,message:"Provider check completed. Refresh to see its recorded result."});}
  return kitchenReply({error:"Unknown notification action."},400);
 }catch{return kitchenReply({error:"The result could not be confirmed. Refresh saved status before trying again."},503);}
}
