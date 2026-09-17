import { NextRequest } from "next/server";
import { kitchenRole } from "@/lib/ordering/auth";
import { getStore } from "@/lib/ordering/store";
import { configuredPrinters } from "@/lib/ordering/printing";
import { isPrintId, parsePrintCommand } from "@/lib/ordering/printer-jobs";
import { kitchenReply } from "@/lib/ordering/kitchen-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 if(await kitchenRole()!=="owner")return kitchenReply({error:"Owner sign-in is required."},403);
 const id=req.nextUrl.searchParams.get("id");if(!isPrintId(id))return kitchenReply({error:"An action reference is required."},400);
 try{const store=getStore();if(store.backend!=="postgres")throw Error();const result=await store.getPrintAction(id);return result?kitchenReply(result):kitchenReply({error:"No saved result yet. Retry the same review or check again."},202);}catch{return kitchenReply({error:"Could not check this review. Keep its reference and check again."},503);}
}
export async function POST(req:NextRequest){
 if(await kitchenRole()!=="owner")return kitchenReply({error:"Owner sign-in is required."},403);
 try{
  const store=getStore();if(store.backend!=="postgres")throw Error();
  if(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json" || !req.body)return kitchenReply({error:"A JSON review is required."},400);
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0,raw:unknown;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return kitchenReply({error:"Review is too large."},413);}chunks.push(value);}raw=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return kitchenReply({error:"Invalid review."},400);}finally{reader.releaseLock();}
  const command=parsePrintCommand(raw);if(!command)return kitchenReply({error:"Choose a current ticket and enter a reason (up to 240 characters)."},400);
  const printer=configuredPrinters().find(p=>p.id===command.printerId);if(!printer)return kitchenReply({error:"This printer is not configured."},400);
  const result=await store.resolvePrintJob(command,printer.role);return kitchenReply(result,result.httpStatus);
 }catch{return kitchenReply({error:"The result is uncertain. Check the saved result before starting another review."},503);}
}
