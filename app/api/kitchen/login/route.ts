import { NextRequest, NextResponse } from "next/server";
import { kitchenPin, setKitchenCookie } from "@/lib/ordering/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let pin = "";
  try {
    pin = String((await req.json()).pin ?? "");
  } catch {
    /* falls through to the mismatch below */
  }
  if (pin !== kitchenPin()) {
    return NextResponse.json({ error: "Wrong PIN." }, { status: 401 });
  }
  await setKitchenCookie();
  return NextResponse.json({ ok: true });
}
