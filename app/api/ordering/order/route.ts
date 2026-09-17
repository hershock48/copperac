// Guest amounts are a review checkpoint. The server reloads current prices,
// validates whole quantities/cents, and requires another review if they changed.
// This adapter records demo/pay-at-pickup orders; it does not charge a card.

import { NextRequest, NextResponse } from "next/server";
import { ORDERING } from "@/lib/ordering/config";
import { guestMenu } from "@/lib/ordering/menu";
import { priceOptions } from "@/lib/ordering/pricing";
import { quoteOrder, quoteWasReviewed } from "@/lib/ordering/order-quote";
import { orderingWindow } from "@/lib/ordering/time";
import { effectiveState, getStore, type Order } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const raw: unknown = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("Malformed request.");
  const body = raw as Record<string, unknown>;
  for (const [key, max] of [["guestName", 60], ["guestPhone", 25], ["guestEmail", 120], ["note", 300]] as const) {
    const value = body[key];
    if ((value !== undefined && (typeof value !== "string" || value.length > max)) || (["guestName", "guestPhone"].includes(key) && typeof value !== "string")) return bad("Use valid contact details and keep notes under 300 characters.");
  }
  for (const key of ["ageAcknowledged", "payAtPickup"]) if (body[key] !== undefined && typeof body[key] !== "boolean") return bad("Malformed checkout choice.");
  const clean = (key: string) => String(body[key] ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim();
  const guestName = clean("guestName"), guestPhone = clean("guestPhone"), guestEmail = clean("guestEmail"), note = clean("note");
  if (!guestName) return bad("A name for the order is required.");
  if (guestPhone.replace(/\D/g, "").length < 10) return bad("A phone number is required so the kitchen can reach you.");
  if (guestEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) return bad("That email does not look right. It is optional, so blank works too.");

  const window = orderingWindow();
  if (!window.open) return bad(window.reason, 409);

  const store = getStore();
  if (process.env.NODE_ENV === "production" && store.backend === "memory") return bad("Ordering requires persistent storage. Please contact the bar.", 503);
  const state = effectiveState(await store.getState());
  if (state.pausedUntil !== null) {
    return bad("The kitchen just paused online ordering. Give it a few minutes or call the bar.", 409);
  }

  let menu;
  try { menu = await guestMenu(store, { fresh: true }); }
  catch { return bad("The current menu could not be checked. Please try later or contact the bar.", 503); }
  const priced = quoteOrder(body.lines, menu.index, state.unavailable, { feeCents: ORDERING.feeCents, tipCents: body.tipCents, taxBasisPoints: ORDERING.taxBasisPoints }, priceOptions);
  if (!priced.ok) return bad(priced.error, priced.status);
  const quote = priced.quote;
  if (!quoteWasReviewed(body.lines, body.expectedTotals, quote)) return NextResponse.json({ error: "Prices or item requirements changed. Review the updated total before placing your order. Older pages need a refresh.", priceChanged: true, quote }, { status: 409 });
  const { lines, hasAlcohol } = quote;
  if (hasAlcohol && body.ageAcknowledged !== true) return bad("Orders with drinks need the 21+ box checked. A valid ID gets checked at pickup.");
  const { subtotalCents, feeCents, tipCents, taxCents, totalCents } = quote.totals;

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
  // design: an email problem must never fail an order. But the send is
  // AWAITED, because fire-and-forget dies on serverless: Vercel freezes the
  // lambda the moment the response returns, so an un-awaited send silently
  // never runs and its catch never logs. Proven live in devine's agreement
  // flow, which delivered exactly one of its two emails for this reason.
  // The catch keeps a bounced email from failing the order.
  const { sendOrderConfirmation } = await import("@/lib/ordering/email");
  await sendOrderConfirmation(order).catch(() => {});

  return NextResponse.json({
    id: order.id,
    number: order.number,
    quotedMinutes: order.quotedMinutes,
    totals: { subtotalCents, feeCents, tipCents, taxCents, totalCents },
    quote,
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
