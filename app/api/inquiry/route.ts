import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";

/**
 * Reserve and contact enquiries.
 *
 * Deliberately fails loudly. Until RESEND_API_KEY and INQUIRY_TO are set in the
 * environment this returns 503 with reason "not_configured", and the form falls
 * back to opening a prefilled email. A form that reports success without
 * sending anything is worse than no form at all, so there is no path here that
 * returns ok:true without a provider having accepted the message.
 *
 * To switch it on: add RESEND_API_KEY, verify the sending domain with Resend,
 * and set INQUIRY_TO to whoever reads enquiries (defaults to SITE.email).
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
