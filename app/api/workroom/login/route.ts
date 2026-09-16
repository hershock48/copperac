import { NextResponse } from "next/server";
import { setWorkroomCookie, workroomPasscode, workroomSessionReady, passcodeMatches } from "@/lib/workroom/auth";
import { allowLogin, clearLoginAttempts } from "@/lib/workroom/login-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const passcode = workroomPasscode();
  if (!passcode || !workroomSessionReady()) return NextResponse.json({ error: "The workroom is not configured for secure sign-in yet.", reason: "unconfigured" }, { status: 503 });
  try {
    if (!(await allowLogin())) return NextResponse.json({ error: "Too many tries. Wait ten minutes." }, { status: 429, headers: { "Retry-After": "600" } });
  } catch { return NextResponse.json({ error: "Sign-in storage is unavailable. Try again later." }, { status: 503 }); }
  const body = await req.json().catch(() => null);
  if (typeof body?.passcode !== "string" || body.passcode.length > 512 || !passcodeMatches(body.passcode, passcode)) return NextResponse.json({ error: "That passcode is not right." }, { status: 401 });
  try { await clearLoginAttempts(); await setWorkroomCookie(passcode); }
  catch { return NextResponse.json({ error: "Sign-in could not finish. Try again later." }, { status: 503 }); }
  return NextResponse.json({ ok: true });
}
