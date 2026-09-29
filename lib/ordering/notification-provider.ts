import type { DeliveryResult, SendResult, Mail } from "./notification-outbox";
import { isProviderId } from "./notification-outbox";

async function boundedJson(response:Response,limit:number):Promise<unknown>{
  const reader=response.body?.getReader();if(!reader)return null;const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();return null;}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return null;}finally{reader.releaseLock();}
}
export async function sendResend(payload:string,idempotencyKey:string,key:string,fetcher:typeof fetch=fetch):Promise<SendResult>{
  try{
    const response=await fetcher("https://api.resend.com/emails",{method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),headers:{Authorization:"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":idempotencyKey},body:payload});
    const raw=await boundedJson(response,8192),data=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
    if(response.ok)return isProviderId(data.id)?{kind:"accepted",id:data.id}:{kind:"retry",code:"MISSING_PROVIDER_ID"};
    const retryAfter=response.headers.get("retry-after"),seconds=retryAfter&&/^\d+$/.test(retryAfter)?Number(retryAfter):0;
    const retryAfterMs=Number.isSafeInteger(seconds)?Math.min(seconds*1000,24*60*60_000):0;
    if(response.status===429||response.status>=500||response.status===408||(response.status===409&&data.name==="concurrent_idempotent_requests"))return {kind:"retry",code:"PROVIDER_HTTP_"+response.status,retryAfterMs};
    return {kind:"blocked",code:response.status===409?"PROVIDER_KEY_CONFLICT":"PROVIDER_HTTP_"+response.status};
  }catch{return {kind:"retry",code:"PROVIDER_RESPONSE_UNKNOWN"};}
}
const events=new Set(["sent","delivered","delivery_delayed","bounced","complained","opened","clicked","failed","suppressed","scheduled","canceled"]);
export async function retrieveResend(providerId:string,payload:string,key:string,fetcher:typeof fetch=fetch):Promise<DeliveryResult>{
  if(!isProviderId(providerId))return {kind:"unavailable",code:"INVALID_PROVIDER_REFERENCE"};
  try{
    const response=await fetcher("https://api.resend.com/emails/"+encodeURIComponent(providerId),{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000),headers:{Authorization:"Bearer "+key}});
    if(!response.ok)return {kind:"unavailable",code:"DELIVERY_CHECK_HTTP_"+response.status};
    const raw=await boundedJson(response,262144),data=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};const mail=JSON.parse(payload) as Mail;
    if(data.id!==providerId||!Array.isArray(data.to)||data.to.length!==1||data.to[0]!==mail.to[0]||data.subject!==mail.subject||data.from!==mail.from||typeof data.last_event!=="string"||!events.has(data.last_event))return {kind:"unavailable",code:"DELIVERY_RESULT_MISMATCH"};
    return {kind:"checked",event:data.last_event};
  }catch{return {kind:"unavailable",code:"DELIVERY_CHECK_UNAVAILABLE"};}
}
