import { createHash,timingSafeEqual } from "node:crypto";
import { runNotificationQueue } from "@/lib/ordering/email";
import { kitchenReply } from "@/lib/ordering/kitchen-service";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=60;
export async function GET(req:Request){
 const secret=process.env.ORDERING_NOTIFICATION_SECRET?.trim()??"",provided=req.headers.get("authorization")??"";
 if(secret.length<32||provided.length>2048)return kitchenReply({error:"Unauthorized."},401);
 const hash=(s:string)=>createHash("sha256").update(s).digest();
 if(!timingSafeEqual(hash(provided),hash("Bearer "+secret)))return kitchenReply({error:"Unauthorized."},401);
 try{return kitchenReply(await runNotificationQueue());}catch{return kitchenReply({error:"Notification worker unavailable."},503);}
}
