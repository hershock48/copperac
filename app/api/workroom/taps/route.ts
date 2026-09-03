import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";

/**
 * The Taps tab: from the workroom straight onto the bar's Scooplist board,
 * signed in, no second PIN.
 *
 * The workroom is already behind its passcode, so being here is proof
 * enough. This route mints a two-minute signed link with the org's handoff
 * key (SCOOPLIST_HANDOFF_KEY, shown once by Scooplist's create-org and
 * copied into this project's env) and redirects the browser to Scooplist's
 * /api/handoff, which verifies it and sets its own session cookie. The
 * Scooplist PIN never passes through this site.
 *
 * Unset key means the tab explains itself rather than bouncing to a login
 * that would look broken.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORG = "copperac";
const FEED = process.env.SCOOPLIST_FEED_URL?.trim() || "https://scooplist.glazedweb.com";

export async function GET(request: Request) {
  if (!(await isWorkroomAuthed())) return NextResponse.redirect(new URL("/workroom", request.url), 303);
  const key = process.env.SCOOPLIST_HANDOFF_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      {
        error:
          "The Taps handoff is not set up on this deployment yet. Set SCOOPLIST_HANDOFF_KEY (from Scooplist's create-org output) and redeploy.",
        reason: "unconfigured",
        fallback: `${FEED}/login/${ORG}`,
      },
      { status: 503 }
    );
  }
  const exp = Math.floor(Date.now() / 1000) + 90;
  const sig = createHmac("sha256", key).update(`${ORG}\n${exp}`).digest("hex");
  const target = new URL(`${FEED}/api/handoff`);
  target.searchParams.set("org", ORG);
  target.searchParams.set("exp", String(exp));
  target.searchParams.set("sig", sig);
  return NextResponse.redirect(target, 303);
}
