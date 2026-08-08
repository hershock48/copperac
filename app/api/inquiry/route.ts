import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";

/**
 * Reserve and contact enquiries.
 *
 * ==========================================================================
 * STATUS: NOT LIVE. No enquiry sent through this site reaches an inbox yet.
 * ==========================================================================
 *
 * Deliberately fails loudly. With no RESEND_API_KEY or INQUIRY_FROM set this
 * returns 503 reason "not_configured" and InquiryForm hands off to the
 * visitor's email app with the fields prefilled. There is no path below that
 * returns ok:true without a provider having accepted the message, because a
 * form that reports success without delivering is worse than no form. The
 * version this replaced waited 500ms, said "Thanks, we got it" and sent
 * nothing anywhere.
 *
 * TO SWITCH IT ON, four steps:
 *
 *   1. Get the club's real monitored inbox. SITE.email is currently
 *      info@copperac.com and that is a placeholder nobody has confirmed.
 *
 *   2. Verify a sending domain in Resend. Resend requires DNS records on
 *      whatever domain the From address lives on, and we do not control
 *      copperac.com's DNS, the client does. Do not wait on them: verify
 *      glazedweb.com and send from e.g. copper@glazedweb.com. The reply_to
 *      below is set to the customer's own address, so the club hits reply and
 *      it goes straight to the customer. Same verified domain works for every
 *      site we build.
 *
 *   3. Set RESEND_API_KEY, INQUIRY_FROM and INQUIRY_TO in the Vercel project.
 *      See .env.example.
 *
 *   4. Redeploy, then actually submit the form once and confirm it arrives.
 *      The success panel only appears when Resend accepted the message, so if
 *      you see it, delivery was accepted.
 *
 * Known gap while this is unconfigured: the mailto fallback needs the visitor
 * to have a registered mail handler. Desktop webmail users get nothing from
 * that click beyond the on-screen note and the phone number.
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

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const get = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  const missing = REQUIRED.filter((k) => !get(k));
  if (missing.length) {
    return NextResponse.json({ ok: false, reason: "missing_fields", missing }, { status: 422 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(get("email"))) {
    return NextResponse.json({ ok: false, reason: "bad_email" }, { status: 422 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.INQUIRY_TO || SITE.email;
  const from = process.env.INQUIRY_FROM;
  if (!apiKey || !from) {
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
      return NextResponse.json(
        { ok: false, reason: "provider_error", status: res.status },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, reason: "network_error" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
