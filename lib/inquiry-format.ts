/**
 * How an enquiry reads in the club's inbox.
 *
 * CLIENT-SAFE ON PURPOSE: no imports, so the route and the tests both load
 * it and the browser could too. The form posts what <input type="date"> and
 * <input type="time"> produce (2026-12-14, 17:30), which is the right thing
 * to send and the wrong thing to read: Abbie, 20 Oct 2026, on the first real
 * enquiry through the new site: "a time that's not in military hours with
 * like an a.m. or p.m. ... December instead of like 12 because there's a lot
 * of numbers in there", and "is there any way to make that inquiry bigger,
 * on my computer it's just super small". The old site sent an HTML table;
 * this one sent eleven lines of plain text. So: the date and times are
 * spelled out, and the email is a table again, with a text part kept for
 * clients that want one.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

/** "2026-12-14" → "Monday, December 14, 2026". Anything else is returned as typed. */
export function formatEventDate(raw: string): string {
  const m = DATE.exec(raw);
  if (!m) return raw;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d, 12));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return raw;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}

/** "17:30" → "5:30 PM", "09:00" → "9:00 AM". Anything else is returned as typed. */
export function formatEventTime(raw: string): string {
  const m = TIME.exec(raw);
  if (!m) return raw;
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23 || Number(min) > 59) return raw;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:${min} ${h < 12 ? "AM" : "PM"}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type InquiryRow = { label: string; value: string };

/**
 * The email as a table: one bold label column, one value column, 16px type
 * with room around it, the way the old site's form mailer laid it out. Inline
 * styles only, because mail clients strip everything else. Every value is
 * escaped; the message keeps its line breaks.
 */
export function inquiryHtml(opts: {
  heading: string;
  rows: InquiryRow[];
  replyTo: { name: string; email: string };
  sourceUrl: string;
}): string {
  const cell = "padding:10px 14px;border-bottom:1px solid #e6e2da;vertical-align:top;font-size:16px;line-height:1.5;";
  const rows = opts.rows
    .map(
      (r) =>
        `<tr><th align="left" style="${cell}font-weight:700;color:#5a5248;white-space:nowrap;width:140px;">${escapeHtml(r.label)}</th>` +
        `<td style="${cell}color:#1d1a16;">${escapeHtml(r.value).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("");
  const reply = escapeHtml(opts.replyTo.email);
  return (
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f3ee;font-family:Helvetica,Arial,sans-serif;color:#1d1a16;">` +
    `<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e6e2da;border-radius:6px;overflow:hidden;">` +
    `<div style="padding:18px 22px;background:#1d1a16;color:#f6f3ee;font-size:20px;font-weight:700;">${escapeHtml(opts.heading)}</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">${rows}</table>` +
    `<div style="padding:16px 22px;font-size:15px;line-height:1.5;color:#5a5248;">` +
    `Reply to this email to answer ${escapeHtml(opts.replyTo.name)} at <a href="mailto:${reply}" style="color:#b86d2a;">${reply}</a>.<br>` +
    `Sent from <a href="${escapeHtml(opts.sourceUrl)}" style="color:#b86d2a;">${escapeHtml(opts.sourceUrl)}</a></div>` +
    `</div></body></html>`
  );
}
