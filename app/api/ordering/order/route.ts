// Place an order (POST) and check one order's status (GET ?id=).
//
// The server is the till: every price is recomputed here from lib/menu.ts via
// the derived orderable menu. The client's numbers are treated as a display
// convenience and nothing else, because a request body is guest input even
// when our own page wrote it.
//
// PAYMENT SEAM. In demo mode (no STRIPE_SECRET_KEY) the order is accepted
// without a charge and the UI says so plainly. The live wiring replaces the
// marked block below with a Stripe Checkout session created on the bar's
// connected account:
//
//   POST /v1/checkout/sessions  with header  Stripe-Account: {acct_...}
//     line_items: the order lines, the 99 cent order fee, the tip
//     payment_intent_data[application_fee_amount]: ORDERING.feeStudioCents
//     automatic_tax[enabled]: true   (Stripe Tax on the connected account)
//     success_url: /order/confirmed?id={id}
//
// The 49/50 split needs no rebate machinery: the fee settles into the bar's
// own account and only the application fee leaves. Env names live in
// .env.example; nothing here reads a key until one exists.

import { NextRequest, NextResponse } from "next/server";
import { ORDERING } from "@/lib/ordering/config";
import { guestMenu } from "@/lib/ordering/menu";
import { orderingWindow } from "@/lib/ordering/time";
import { effectiveState, getStore, type Order, type OrderLine } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";

type IncomingLine = { itemId: string; qty: number; options: string[] };
type IncomingOrder = {
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  note?: string;
  tipCents: number;
  lines: IncomingLine[];
  ageAcknowledged?: boolean;
  payAtPickup?: boolean;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let body: IncomingOrder;
  try {
    body = await req.json();
  } catch {
    return bad("Malformed request.");
  }

  const guestName = String(body.guestName ?? "").trim().slice(0, 60);
  const guestPhone = String(body.guestPhone ?? "").trim().slice(0, 25);
  const note = String(body.note ?? "").trim().slice(0, 300);
  const guestEmail = String(body.guestEmail ?? "").trim().slice(0, 120);
  if (guestEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) {
    return bad("That email does not look right. It is optional, so blank works too.");
  }
  if (!guestName) return bad("A name for the order is required.");
  if (guestPhone.replace(/\D/g, "").length < 10) return bad("A phone number is required so the kitchen can reach you.");
  if (!Array.isArray(body.lines) || body.lines.length === 0) return bad("The cart is empty.");
  if (body.lines.length > 30) return bad("That is a catering order. Call the bar and they will take care of you.");

  const window = orderingWindow();
  if (!window.open) return bad(window.reason, 409);

  const store = getStore();
  const state = effectiveState(await store.getState());
  if (state.pausedUntil !== null) {
    return bad("The kitchen just paused online ordering. Give it a few minutes or call the bar.", 409);
  }

  const { index: ITEM_INDEX } = await guestMenu(store);
  const lines: OrderLine[] = [];
  for (const raw of body.lines) {
    const item = ITEM_INDEX.get(String(raw.itemId));
    if (!item) return bad("An item in the cart is no longer on the menu.");
    if (state.unavailable.includes(item.id)) {
      return bad(`${item.name} just sold out tonight. Take it out of the cart and the rest can go through.`, 409);
    }
    const qty = Math.floor(Number(raw.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 12) return bad("Quantity out of range.");

    const chosen = Array.isArray(raw.options) ? raw.options.map(String) : [];
    let optionCents = 0;
    for (const group of item.options) {
      const inGroup = group.choices.filter((c) => chosen.includes(c.name));
      if (group.multi) {
        // Any number; required multi means at least one.
        if (group.required && inGroup.length === 0) {
          return bad(`${item.name} needs at least one ${group.name.toLowerCase()}.`);
        }
      } else {
        if (group.required && inGroup.length !== 1) {
          return bad(`${item.name} needs a ${group.name.toLowerCase()} picked.`);
        }
        if (!group.required && inGroup.length > 1) return bad("Malformed options.");
      }
      optionCents += inGroup.reduce((sum, c) => sum + c.priceCents, 0);
    }
    // Reject names that match no group: silence here would misprice quietly.
    const legal = new Set(item.options.flatMap((g) => g.choices.map((c) => c.name)));
    if (chosen.some((c) => !legal.has(c))) return bad("Malformed options.");

    const unitCents = item.priceCents + optionCents;
    lines.push({
      itemId: item.id,
      name: item.name,
      qty,
      unitCents,
      options: chosen,
      lineCents: unitCents * qty,
    });
  }

  const hasAlcohol = lines.some((l) => ITEM_INDEX.get(l.itemId)?.ageRestricted);
  if (hasAlcohol && body.ageAcknowledged !== true) {
    return bad("Orders with drinks need the 21+ box checked. A valid ID gets checked at pickup.");
  }

  const subtotalCents = lines.reduce((s, l) => s + l.lineCents, 0);
  const feeCents = ORDERING.feeCents;
  const tipCents = Math.floor(Number(body.tipCents));
  if (!Number.isFinite(tipCents) || tipCents < 0 || tipCents > subtotalCents * 2) {
    return bad("Tip out of range.");
  }
  // MI 6% on the food and the fee; the tip is not taxable. The live build
  // hands this to Stripe Tax instead of computing it here.
  const taxCents = Math.round((subtotalCents + feeCents) * ORDERING.taxRate);
  const totalCents = subtotalCents + feeCents + tipCents + taxCents;

  const order: Order = {
    id: crypto.randomUUID(),
    number: await store.nextTicketNumber(),
    guestName,
    guestPhone,
    guestEmail,
    note,
    lines,
    subtotalCents,
    feeCents,
    tipCents,
    taxCents,
    totalCents,
    quotedMinutes: ORDERING.basePickupMinutes + state.busyMinutes,
    hasAlcohol,
    // PAYMENT SEAM: flips to true when Stripe confirms the charge. Until
    // then the front-of-house slip prints DUE AT PICKUP with tip and
    // signature lines. payAtPickup orders skip Stripe entirely, live and
    // demo alike: the counter collects, so paid stays false for good and
    // there is no application fee to split -- the whole 99 cents is rung
    // into the till with the rest.
    paid: false,
    payAtPickup: body.payAtPickup === true,
    status: "new",
    createdAt: Date.now(),
    acceptedAt: null,
  };

  await store.createOrder(order);

  // Fan out one job per configured printer, each with its station's own
  // template. No printers configured means no jobs: the chime path carries.
  const { configuredPrinters, renderFor } = await import("@/lib/ordering/printing");
  for (const printer of configuredPrinters()) {
    await store.enqueuePrintJob({
      id: crypto.randomUUID(),
      printerId: printer.id,
      orderId: order.id,
      body: renderFor(printer.role, order),
      status: "queued",
      createdAt: Date.now(),
    });
  }

  // Courtesy copy of what the confirmation screen shows. Best-effort by
  // design: an email problem must never fail an order.
  const { sendOrderConfirmation } = await import("@/lib/ordering/email");
  sendOrderConfirmation(order).catch(() => {});

  return NextResponse.json({
    id: order.id,
    number: order.number,
    quotedMinutes: order.quotedMinutes,
    totals: { subtotalCents, feeCents, tipCents, taxCents, totalCents },
  });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("Missing id.");
  const order = await getStore().getOrder(id);
  if (!order) return bad("No such order.", 404);
  // Only what the confirmation screen needs; the phone number stays server-side.
  return NextResponse.json({
    number: order.number,
    status: order.status,
    quotedMinutes: order.quotedMinutes,
    createdAt: order.createdAt,
  });
}
