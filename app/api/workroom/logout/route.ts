import { NextResponse } from "next/server";
import { clearWorkroomCookie } from "@/lib/workroom/auth";

/** Lock the workroom. A shared or borrowed phone needs a way to close itself. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearWorkroomCookie();
  return NextResponse.json({ ok: true });
}
