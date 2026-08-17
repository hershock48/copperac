// The kitchen's view of the queue. GET lists active orders; PATCH moves one
// through new -> accepted -> done. The screen polls GET every few seconds;
// that poll doubles as the store-backend health check the UI surfaces.

import { NextRequest, NextResponse } from "next/server";
import { isKitchenAuthed } from "@/lib/ordering/auth";
import { getStore, type OrderStatus } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKitchenAuthed())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const store = getStore();
  const orders = await store.listActiveOrders();
  return NextResponse.json({ orders, backend: store.backend });
}

const LEGAL: Record<string, OrderStatus> = { accepted: "accepted", done: "done", refunded: "refunded" };

export async function PATCH(req: NextRequest) {
  if (!(await isKitchenAuthed())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const status = LEGAL[String(body.status)];
  if (!body.id || !status) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const store = getStore();
  await store.setOrderStatus(String(body.id), status);
  if (status === "refunded") {
    // PAYMENT SEAM: when Stripe is live this is where the actual refund is
    // created on the bar's connected account (refund_application_fee: true --
    // our 49 cents goes back too; keeping a fee on a refunded order is not
    // who we are). Demo orders were never charged, so only the notice sends.
    const order = await store.getOrder(String(body.id));
    if (order) {
      const { sendRefundNotice } = await import("@/lib/ordering/email");
      sendRefundNotice(order).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}
