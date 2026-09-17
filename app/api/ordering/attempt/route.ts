import { NextRequest, NextResponse } from "next/server";
import { isAttemptId, readAttemptBody } from "@/lib/ordering/order-acceptance";
import { getStore } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id"); if (!isAttemptId(id)) return json({ error: "Invalid submission reference." }, 400);
  try {
    const store = getStore(); if (process.env.NODE_ENV === "production" && store.backend === "memory") throw Error("Storage unavailable");
    const attempt = await store.getAttempt(id);
    return attempt ? json(attempt.response) : json({ attemptId: id, outcome: "unknown", error: "No result is recorded yet. Keep this reference while the submission is checked." }, 202);
  } catch { return json({ attemptId: id, outcome: "unknown", error: "The submission result could not be checked." }, 503); }
}
/** Stop only an unaccepted submission. The unique key fences delayed requests;
 * if an order already won, return its receipt instead of claiming cancellation. */
export async function POST(req: NextRequest) {
  const body = await readAttemptBody(req), id = body?.attemptId;
  if (!isAttemptId(id)) return json({ error: "Invalid submission reference." }, 400);
  try {
    const store = getStore(); if (process.env.NODE_ENV === "production" && store.backend === "memory") throw Error("Storage unavailable");
    const result = await store.settleAttempt({ id, fingerprint: null, createdAt: Date.now(), outcome: "cancelled", status: 409, response: { attemptId: id, outcome: "cancelled", error: "This submission was stopped. No order was created for it." } });
    return json(result.attempt.response);
  } catch { return json({ attemptId: id, outcome: "unknown", error: "We could not confirm that the submission stopped. Check its status before placing another order." }, 503); }
}
