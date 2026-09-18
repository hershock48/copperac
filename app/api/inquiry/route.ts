import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";

/**
 * Reserve and contact enquiries.
 *
 * LIVE since 21 Aug 2026: sends via Resend from the verified glazedweb.com
 * domain to the club's inbox. Config is RESEND_API_KEY, INQUIRY_FROM and
 * INQUIRY_TO (see .env.example and the README).
 *
 * Deliberately fails loudly. With no RESEND_API_KEY or INQUIRY_FROM set this
 * returns 503 reason "not_configured" and InquiryForm hands off to the
 * visitor's email app with the fields prefilled. There is no path below that
 * returns ok:true without a provider having accepted the message, because a
 * form that reports success without delivering is worse than no form. The
 * version this replaced waited 500ms, said "Thanks, we got it" and sent
 * nothing anywhere.
 *
 * WHEN A GUEST REPORTS THE FORM OPENING THEIR EMAIL APP, that is this route
 * refusing, and the mailto fallback doing its job. Every refusal below logs
 * one line to the Vercel runtime logs saying which one and why; read those
 * first, because the browser only ever sees the reason code. The three:
 *   503 not_configured  an env var is missing
 *   502 provider_error  Resend answered, and said no (the line carries its
 *                       status and body: a bad key is 401, an unverified
 *                       From domain is 403)
 *   502 network_error   the call to Resend never completed
 *
 * Env values are trimmed on read. A trailing space or CR on a pasted key is
 * invisible in every dashboard and would otherwise fail as a bad credential.
 *
 * Known gap when unconfigured: the mailto fallback needs the visitor to have
 * a registered mail handler. Desktop webmail users get nothing from that
 * click beyond the on-screen note and the phone number.
 *
 * Nothing is stored. The club's inbox is the only record of an enquiry and
 * the runtime log is the only record of a refusal. docs/intake-trace-2026-09-17.md
 * traces the whole path, including what the owner cannot do about one.
 */

// createHash below needs it, and every other route in this app declares it.
export const runtime = "nodejs";

const REQUIRED = ["first", "last", "email", "phone"] as const;

const LABELS: Record<string, string> = {
  first: "First name",
  last: "Last name",
  email: "Email",
  phone: "Phone",
  eventType: "Type of event",
  date: "Event date",
  start: "Start time",
  end: "End time",
  guests: "Guests",
  subject: "Subject",
  message: "Message",
};

// Per-field ceilings. This inbox is relayed through our shared glazedweb.com
// sending identity, so an unbounded field is an unbounded payload sent under
// every Glazed Web site's sender reputation. A real enquiry clears these by an
// order of magnitude; message is the only long field.
const MAX_LEN: Record<string, number> = { message: 4000 };
const DEFAULT_MAX = 200;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  // A JSON body of null/array/string is valid JSON but not a form. Guard it, or
  // `body[k]` below throws a TypeError and the handler 500s instead of 400ing.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;

  // Trim, and strip control characters (including CR/LF) so nothing a guest
  // types can smuggle a line break into the email subject built from these.
  const get = (k: string) =>
    typeof fields[k] === "string"
      ? (fields[k] as string).replace(/[\u0000-\u001f\u007f]/g, " ").trim()
      : "";

  const oversized = Object.keys(LABELS).find(
    (k) => get(k).length > (MAX_LEN[k] ?? DEFAULT_MAX)
  );
  if (oversized) {
    return NextResponse.json(
      { ok: false, reason: "too_long", field: oversized },
      { status: 422 }
    );
  }

  const missing = REQUIRED.filter((k) => !get(k));
  if (missing.length) {
    return NextResponse.json({ ok: false, reason: "missing_fields", missing }, { status: 422 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(get("email"))) {
    return NextResponse.json({ ok: false, reason: "bad_email" }, { status: 422 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.INQUIRY_TO?.trim() || SITE.email;
  const from = process.env.INQUIRY_FROM?.trim();
  if (!apiKey || !from) {
    console.error(
      `[inquiry] 503 not_configured: RESEND_API_KEY ${apiKey ? "set" : "MISSING"}, INQUIRY_FROM ${from ? "set" : "MISSING"}`
    );
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const variant = get("variant") === "reserve" ? "reserve" : "contact";
  const subject =
    variant === "reserve"
      ? `Copper Reserve enquiry: ${get("eventType") || "private event"}${get("date") ? ` on ${get("date")}` : ""}`
      : `Website enquiry: ${get("subject") || "general"}`;

  const lines = Object.entries(LABELS)
    .filter(([k]) => get(k))
    .map(([k, label]) => `${label}: ${get(k)}`);
  lines.push("", `Sent from ${SITE.url}${variant === "reserve" ? "/reserve" : "/contact"}`);

  const text = lines.join("\n");

  /*
   * One enquiry, one email. A double-click, a back-then-resubmit, a second
   * tab, or a retry after the 12s abort below all POST the same content
   * again, and before this key each one put another copy in the club's
   * inbox. Resend holds an idempotency key for 24 hours and replays its
   * original answer, so the repeat still returns an acceptance id and the
   * guest still sees the success panel while the club sees one message.
   *
   * Keyed on exactly what we are about to send: a guest who writes a genuinely
   * different message, or writes again next week about a different date, gets
   * a different key and a second email, which is what they meant. The hash is
   * over content the guest chose, so it carries their words; it is truncated
   * and never logged or returned.
   */
  const idempotencyKey = `copper-inquiry-${createHash("sha256")
    .update(`${variant}\n${to}\n${subject}\n${text}`)
    .digest("hex")
    .slice(0, 40)}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: get("email"),
        subject,
        text,
      }),
    });
    if (!res.ok) {
      // Resend's body names the actual problem (bad key, unverified From
      // domain, malformed address). Without it this is an unreadable 502.
      const detail = await res.text().catch(() => "<unreadable>");
      console.error(`[inquiry] 502 provider_error: Resend ${res.status} ${detail}`);
      return NextResponse.json(
        { ok: false, reason: "provider_error", status: res.status },
        { status: 502 }
      );
    }
    const accepted = await res.json().catch(() => null);
    if (typeof accepted?.id !== "string" || !accepted.id) {
      return NextResponse.json({ ok: false, reason: "provider_error" }, { status: 502 });
    }
  } catch (err) {
    console.error("[inquiry] 502 network_error: call to Resend failed:", err);
    return NextResponse.json({ ok: false, reason: "network_error" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
