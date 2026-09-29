import type { PrintAction, PrintCommand } from "./printer-jobs";
export function readPrintAction(raw:unknown, command:PrintCommand):PrintAction|null {
 if(!raw || typeof raw!=="object")return null;
 const v=raw as PrintAction, c=v.command;
 if(v.operationId!==command.operationId || !c || Object.keys(command).some(k=>c[k as keyof PrintCommand]!==command[k as keyof PrintCommand]) || Object.keys(c).length!==Object.keys(command).length || !Number.isSafeInteger(v.createdAt) || typeof v.message!=="string" || !v.message || v.message.length>500)return null;
 if(v.outcome==="rejected" && [400,403,404,409].includes(v.httpStatus))return v;
 if(v.outcome!=="saved" || v.httpStatus!==200)return null;
 if(command.mode==="reprint" && (typeof v.replacementId!=="string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.replacementId)))return null;
 return v;
}
export async function requestPrintReview(command:PrintCommand,check=false,fetcher:typeof fetch=fetch,timeoutMs=12000):Promise<PrintAction|null>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const response=await fetcher(check?"/api/kitchen/print-review?id="+encodeURIComponent(command.operationId):"/api/kitchen/print-review",{method:check?"GET":"POST",cache:"no-store",signal:controller.signal,...(check?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(command)})});
 const result=readPrintAction(await response.json(),command);return (check?response.ok:response.status===result?.httpStatus)?result:null;
 }catch{return null;}finally{clearTimeout(timer);}
}
