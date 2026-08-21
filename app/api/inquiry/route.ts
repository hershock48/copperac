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
 */

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
      ? // eslint-disable-next-line no-control-regex
        (fields[k] as string).replace(/[\u0000-\u001f\u007f]/g, " ").trim()
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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: get("email"),
        subject,
        text: lines.join("\n"),
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
  } catch (err) {
    console.error("[inquiry] 502 network_error: call to Resend failed:", err);
    return NextResponse.json({ ok: false, reason: "network_error" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
