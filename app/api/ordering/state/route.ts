// Public ordering state: is ordering open, what is 86'd, what is the quote.
// The order page polls this; it must never require auth and never cache.

import { NextResponse } from "next/server";
import { ORDERING } from "@/lib/ordering/config";
import { orderingWindow } from "@/lib/ordering/time";
import { effectiveState, getStore } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const state = effectiveState(await store.getState());
  const window = orderingWindow();

  let open = window.open;
  let reason = window.open ? "" : window.reason;
  if (open && state.pausedUntil !== null) {
    open = false;
    const mins = Math.max(1, Math.ceil((state.pausedUntil - Date.now()) / 60000));
    reason = `The kitchen is slammed. Online ordering is paused for about ${mins} more minute${mins === 1 ? "" : "s"}. The phone still works: call the bar.`;
  }

  if (process.env.NODE_ENV === "production" && store.backend === "memory") { open = false; reason = "Ordering is unavailable while storage is disconnected. Please contact the bar."; }

  return NextResponse.json({
    open,
    reason,
    unavailable: state.unavailable,
    quoteMinutes: ORDERING.basePickupMinutes + state.busyMinutes,
    feeCents: ORDERING.feeCents,
    feeLabel: ORDERING.feeLabel,
    feeExplainer: ORDERING.feeExplainer,
    taxRate: ORDERING.taxBasisPoints / 10000,
    taxBasisPoints: ORDERING.taxBasisPoints,
    // No online payment adapter is implemented; a key alone cannot activate it.
    demo: true,
  });
}
