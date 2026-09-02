import { NextResponse } from "next/server";
import { setWorkroomCookie, workroomPasscode, passcodeMatches } from "@/lib/workroom/auth";
import { clientKey, limiter } from "@/lib/workroom/ratelimit";

/**
 * The workroom door, with a bouncer: five misses per ten minutes per
 * address. Lifted from anchor's login route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logins = limiter("workroom-login", { windowMs: 10 * 60 * 1000, max: 5 });

export async function POST(req: Request) {
  const passcode = workroomPasscode();
  if (passcode === null) {
    // Unset in production is a closed door, not an open one. Say so plainly:
    // this is the operator's problem to fix and nobody else's to work around.
    return NextResponse.json(
      { error: "The workroom is not set up on this deployment yet.", reason: "unconfigured" },
      { status: 503 }
    );
  }

  const key = clientKey(req);
  if (!logins.allowed(key)) {
    return NextResponse.json(
      { error: "Too many tries. Wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(logins.retryAfterSec()) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { passcode?: unknown };
  if (typeof body.passcode !== "string" || !passcodeMatches(body.passcode, passcode)) {
    logins.fail(key);
    return NextResponse.json({ error: "That passcode is not right." }, { status: 401 });
  }

  logins.clear(key);
  await setWorkroomCookie(passcode);
  return NextResponse.json({ ok: true });
}
