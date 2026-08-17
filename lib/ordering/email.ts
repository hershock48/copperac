// Guest email: order confirmation and refund notice.
//
// Sends through Resend's REST API with the same delivery posture as the
// enquiry form (see glaze.md): when RESEND_API_KEY is unset, the email is
// NOT faked -- the full payload goes to the server log so nothing is lost,
// and the caller carries on. Email here is a courtesy copy of state the
// guest can already see on their confirmation screen, so best-effort is the
// honest level: an email failure must never fail an order.
//
// From-address strategy is the studio standard: a verified glazedweb.com
// sender, reply_to the bar's inbox, so no client DNS work is ever on the
// critical path.

import { ORDERING } from "./config";
import { SITE } from "@/lib/site";
import type { Order } from "./store";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function orderLines(order: Order): string {
  return order.lines
    .map((l) => `  ${l.qty} x ${l.name}${l.options.length ? ` (${l.options.join(", ")})` : ""} - ${money(l.lineCents)}`)
    .join("\n");
}

async function send(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INQUIRY_FROM;
  if (!key || !from) {
    console.log(`[ordering email, delivery unconfigured] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Copper Athletic Club <${from}>`,
        to: [to],
        reply_to: SITE.email,
        subject,
        text,
      }),
    });
  } catch (err) {
    console.log(`[ordering email failed] to=${to} subject="${subject}"`, err);
  }
}

export async function sendOrderConfirmation(order: Order): Promise<void> {
  if (!order.guestEmail) return;
  const paidLine = order.paid
    ? "Paid online. Nothing owed at pickup."
    : `Due at pickup: ${money(order.totalCents)}.`;
  await send(
    order.guestEmail,
    `Order #${order.number} at Copper Athletic Club`,
    `Thanks, ${order.guestName}. The kitchen has your order.

Order #${order.number} - ready in about ${order.quotedMinutes} minutes.

${orderLines(order)}

  Subtotal      ${money(order.subtotalCents)}
  Taxes & fees  ${money(order.feeCents + order.taxCents)}${order.tipCents > 0 ? `\n  Tip           ${money(order.tipCents)}` : ""}
  Total         ${money(order.totalCents)}

${paidLine}
${order.hasAlcohol ? "Your order includes drinks: whoever picks it up shows a valid ID (21+).\n" : ""}
Pickup at the bar: ${SITE.street}, ${SITE.city}. Questions? Call ${SITE.phone}.`
  );
}

export async function sendRefundNotice(order: Order): Promise<void> {
  if (!order.guestEmail) return;
  await send(
    order.guestEmail,
    `Refund for order #${order.number} at Copper Athletic Club`,
    `Hi ${order.guestName},

Your refund of ${money(order.totalCents)} for order #${order.number} has been issued.

${order.paid
  ? "Card refunds usually appear on your statement in 5 to 10 business days, depending on your bank."
  : "This order was not charged online, so there is nothing further to do."}

Sorry it did not work out this time. Questions? Call ${SITE.phone}.`
  );
}

// Referenced so a future non-Copper build remembers this file is Copper-fitted:
// the venue name and numbers above come from lib/site.ts, and the multi-tenant
// extraction parameterizes exactly these.
void ORDERING;
