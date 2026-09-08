import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { SCOOPLIST_FEED_TAG } from "@/lib/scooplist-feed";

/**
 * Scooplist tells this site the bar's case changed; this site drops its
 * caches on the spot.
 *
 * Kevin, 8 Sep 2026: a beer added at the bar "seemed to take a while" to
 * show. It did. The feed was polled every 60 seconds behind pages that
 * regenerated every 60 seconds, behind Scooplist's own edge cache, and a
 * kicked keg could sit on the site for several minutes. Now Scooplist
 * POSTs here after every case write (its lib/notify.ts) and the next
 * visitor gets a fresh render; the polling stays as the floor for the day
 * the ping does not arrive.
 *
 * Signed with SCOOPLIST_HANDOFF_KEY, the secret this project already holds
 * for the workroom's Taps tab, so switching this on took no new secret:
 *
 *   x-scooplist-org:        copperac
 *   x-scooplist-timestamp:  unix seconds, within five minutes of now
 *   x-scooplist-signature:  HMAC-SHA256(key, "copperac\n{timestamp}")
 *
 * A bad or missing signature is a 401 with no detail; an unset key is a
 * 503 that says so, because the operator is the one reading it. GET
 * answers with whether the hook is configured, for /api/status-style
 * checks from outside, and never revalidates anything.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORG = "copperac";
const MAX_SKEW_S = 300;

function key(): string | null {
  const k = process.env.SCOOPLIST_HANDOFF_KEY?.trim();
  return k ? k : null;
}

export async function GET() {
  return NextResponse.json(
    { configured: key() !== null, org: ORG, method: "POST" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const k = key();
  if (!k) {
    return NextResponse.json(
      { error: "SCOOPLIST_HANDOFF_KEY is not set on this deployment; the site polls the feed instead." },
      { status: 503 }
    );
  }
  const org = request.headers.get("x-scooplist-org") ?? "";
  const ts = Number(request.headers.get("x-scooplist-timestamp") ?? "");
  const sig = request.headers.get("x-scooplist-signature") ?? "";
  const now = Math.floor(Date.now() / 1000);
  const deny = () => NextResponse.json({ error: "Not authorized." }, { status: 401 });

  if (org !== ORG) return deny();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_S) return deny();
  if (!/^[a-f0-9]{64}$/.test(sig)) return deny();
  const expected = createHmac("sha256", k).update(`${ORG}\n${ts}`).digest("hex");
  if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return deny();

  // The feed's data-cache entry, then every page that renders from it (the
  // homepage card, the menu page's bar area, the On Tap page). The layout
  // form is what the workroom's saves use, and for the same reason: one
  // call, nothing to forget when a new page starts reading the feed.
  revalidateTag(SCOOPLIST_FEED_TAG, "max");
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, revalidated: ["/", "/menu", "/taps"] });
}
