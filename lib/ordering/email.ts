import "server-only";
import { createHash } from "node:crypto";
import { getStore, type Order } from "./store";
import { SITE } from "@/lib/site";
import { ORDERING } from "./config";
import type { Mail } from "./notification-outbox";
import { sendResend,retrieveResend } from "./notification-provider";

export function notificationConfiguration(){
 const key=process.env.RESEND_API_KEY?.trim()??"",from=process.env.INQUIRY_FROM?.trim()??"";
 const enabled=process.env.ORDERING_EMAIL_ENABLED==="true"&&!!key&&!!from;
 return {enabled,key,from,credential:createHash("sha256").update(key).digest("hex"),reason:process.env.ORDERING_EMAIL_ENABLED!=="true"?"Order emails are disabled until delivery setup is verified.":!key||!from?"The email provider or sender is not configured.":""};
}
const money=(cents:number)=>"$"+(cents/100).toFixed(2);
export function renderOrderConfirmation(raw:Record<string,unknown>,from:string):Mail{
 const order=raw as unknown as Order;
 const received=new Intl.DateTimeFormat("en-US",{timeZone:ORDERING.timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(order.createdAt));
 return {from,to:[order.guestEmail],reply_to:SITE.email,subject:"Order #"+order.number+" at "+SITE.name,text:
  "Thanks, "+order.guestName+". Your order was received at "+received+".\n\n"+
  "Order #"+order.number+". The pickup estimate at submission was "+order.quotedMinutes+" minutes; check your order screen or call the bar for its current status.\n\n"+
  order.lines.map(l=>"  "+l.qty+" x "+l.name+(l.options.length?" ("+l.options.join(", ")+")":"")+" - "+money(l.lineCents)).join("\n")+
  "\n\nSubtotal: "+money(order.subtotalCents)+"\nTaxes & fees: "+money(order.feeCents+order.taxCents)+(order.tipCents>0?"\nTip: "+money(order.tipCents):"")+"\nTotal: "+money(order.totalCents)+"\n\n"+
  (order.paid?"The order record shows paid online.":"Due at pickup: "+money(order.totalCents)+". Cash or card at the bar.")+"\n"+
  (order.hasAlcohol?"For drinks, whoever picks up must show a valid ID (21+).\n":"")+
  "Pickup: "+SITE.street+", "+SITE.city+". Questions or changes? Call "+SITE.phone+".\n\nOrder reference: "+order.id};
}
export async function sendOrderConfirmation(order:Pick<Order,"id">):Promise<void>{
 const config=notificationConfiguration();if(!config.enabled)return;
 const store=getStore();if(store.backend!=="postgres")throw Error("Persistent notification storage is required.");
 await store.dispatchNotification(order.id,o=>renderOrderConfirmation(o,config.from),config.credential,"copperac",(payload,key)=>sendResend(payload,key,config.key));
}
export async function checkOrderNotification(id:string):Promise<void>{
 const config=notificationConfiguration();if(!config.key)throw Error("The email provider is not configured.");
 const store=getStore();if(store.backend!=="postgres")throw Error("Persistent notification storage is required.");
 await store.checkNotification(id,(providerId,payload)=>retrieveResend(providerId,payload,config.key));
}
export async function runNotificationQueue(){
 const config=notificationConfiguration();if(!config.key)return {enabled:false,processed:0,checked:0,errors:0,message:config.reason};
 const store=getStore();if(store.backend!=="postgres")throw Error("Persistent notification storage is required.");
 let processed=0,checked=0,errors=0;
 for(const id of config.enabled?await store.dueNotifications():[]){try{await sendOrderConfirmation({id});processed++;}catch{errors++;}}
 for(const id of await store.dueDeliveryChecks()){try{await checkOrderNotification(id);checked++;}catch{errors++;}}
 return {enabled:config.enabled,processed,checked,errors,message:!config.enabled?config.reason+" Available provider results were checked.":errors?"Some notification checks failed. Refresh their saved status before retrying.":"Due confirmations processed. Refresh their saved status for provider results."};
}
