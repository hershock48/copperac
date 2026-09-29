// A submission reference settles once: accepted order, rejected input, or a
// stopped submission. Retries recover the recorded result before repricing.
import { NextRequest, NextResponse } from "next/server";
import { ORDERING } from "@/lib/ordering/config";
import { guestMenu } from "@/lib/ordering/menu";
import { priceOptions } from "@/lib/ordering/pricing";
import { quoteOrder, quoteWasReviewed } from "@/lib/ordering/order-quote";
import { isAttemptId, readAttemptBody, requestFingerprint, type Attempt } from "@/lib/ordering/order-acceptance";
import { orderingWindow } from "@/lib/ordering/time";
import { effectiveState, getStore, type Order } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });
function recorded(attempt: Attempt, fingerprint: string) {
  if (attempt.fingerprint !== null && attempt.fingerprint !== fingerprint) return NextResponse.json({ attemptId: attempt.id, outcome: "conflict", error: "This submission reference belongs to different details. Check its recorded result before starting another order." }, { status: 409, headers });
  return NextResponse.json(attempt.response, { status: attempt.status, headers });
}

export async function POST(req: NextRequest) {
  const body = await readAttemptBody(req);
  if (!body || !isAttemptId(body.attemptId)) return bad("This checkout page needs a refresh before ordering.");
  const attemptId = body.attemptId;
  try {
    const fingerprint = requestFingerprint(body), store = getStore();
    if (process.env.NODE_ENV === "production" && store.backend === "memory") throw Error("Persistent ordering storage is required.");
    const existing = await store.getAttempt(attemptId);
    if (existing) return recorded(existing, fingerprint);
    const reject = async (error: string, status = 400, extra: Record<string, unknown> = {}) => {
      const result = await store.settleAttempt({ id: attemptId, fingerprint, createdAt: Date.now(), outcome: "rejected", status, response: { ...extra, error, attemptId, outcome: "rejected" } });
      return recorded(result.attempt, fingerprint);
    };
    for (const [key, max] of [["guestName", 60], ["guestPhone", 25], ["guestEmail", 120], ["note", 300]] as const) {
      const value = body[key];
      if ((value !== undefined && (typeof value !== "string" || value.length > max)) || (["guestName", "guestPhone"].includes(key) && typeof value !== "string")) return reject("Use valid contact details and keep notes under 300 characters.");
    }
    for (const key of ["ageAcknowledged", "payAtPickup"]) if (body[key] !== undefined && typeof body[key] !== "boolean") return reject("Malformed checkout choice.");
    const clean = (key: string) => String(body[key] ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim();
    const guestName = clean("guestName"), guestPhone = clean("guestPhone"), guestEmail = clean("guestEmail"), note = clean("note");
    if (!guestName) return reject("A name for the order is required.");
    if (guestPhone.replace(/\D/g, "").length < 10) return reject("A phone number is required so the kitchen can reach you.");
    if (guestEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) return reject("That email does not look right. It is optional, so blank works too.");
    const window = orderingWindow(); if (!window.open) return reject(window.reason, 409);
    const state = effectiveState(await store.getState());
    if (state.pausedUntil !== null) return reject("The kitchen just paused online ordering. Give it a few minutes or call the bar.", 409);
    let menu;
    try { menu = await guestMenu(store, { fresh: true }); }
    catch { return reject("The current menu could not be checked. Please try later or contact the bar.", 503); }
    const priced = quoteOrder(body.lines, menu.index, state.unavailable, { feeCents: ORDERING.feeCents, tipCents: body.tipCents, taxBasisPoints: ORDERING.taxBasisPoints }, priceOptions);
    if (!priced.ok) return reject(priced.error, priced.status);
    const quote = priced.quote;
    if (!quoteWasReviewed(body.lines, body.expectedTotals, quote)) return reject("Prices or item requirements changed. Review the updated total before placing your order.", 409, { priceChanged: true, quote });
    if (quote.hasAlcohol && body.ageAcknowledged !== true) return reject("Orders with drinks need the 21+ box checked. A valid ID gets checked at pickup.");
    const createdAt = Date.now();
    const order: Order = { id: attemptId, number: await store.nextTicketNumber(), guestName, guestPhone, guestEmail, note, lines: quote.lines, ...quote.totals, quotedMinutes: ORDERING.basePickupMinutes + state.busyMinutes, hasAlcohol: quote.hasAlcohol, paid: false, payAtPickup: body.payAtPickup === true, status: "new", createdAt, acceptedAt: null };
    const { configuredPrinters, renderFor } = await import("@/lib/ordering/printing");
    const jobs = configuredPrinters().map(printer => ({ id: crypto.randomUUID(), printerId: printer.id, orderId: order.id, body: renderFor(printer.role, order), status: "queued" as const, createdAt }));
    const response = { attemptId, outcome: "accepted", id: order.id, number: order.number, quotedMinutes: order.quotedMinutes, totals: quote.totals, quote, payAtPickup: order.payAtPickup };
    const result = await store.settleAttempt({ id: attemptId, fingerprint, createdAt, outcome: "accepted", status: 200, response }, order, jobs);
    // The atomic intent survives checkout response loss. The worker and owner
    // controls can recover eligible sends; only a provider ID proves acceptance.
    if(result.created && guestEmail){try{const {sendOrderConfirmation}=await import("@/lib/ordering/email");await sendOrderConfirmation(order);}catch{/* Order acceptance remains durable. */}}
    return recorded(result.attempt, fingerprint);
  } catch {
    return NextResponse.json({ attemptId, outcome: "unknown", error: "We could not confirm the submission. Check its status or retry the same submission." }, { status: 503, headers });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!isAttemptId(id)) return bad("Missing or invalid order reference.");
  try {
    const order = await getStore().getOrder(id); if (!order) return bad("No such order.", 404);
    return NextResponse.json({ number: order.number, status: order.status, quotedMinutes: order.quotedMinutes, createdAt: order.createdAt }, { headers });
  } catch { return bad("The order status could not be checked.", 503); }
}
