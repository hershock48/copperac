import { isQuoteForSubmission, quoteWasReviewed, sameTotals, type OrderQuote } from "./order-quote";

export type Submission = { id: string; body: string | null };
export type Recovery =
  | { kind: "accepted"; receipt: { id: string; number: number; quotedMinutes: number; totalCents: number; payAtPickup: boolean; emailedTo: string; status: "new" } }
  | { kind: "rejected" | "cancelled"; error: string; quote?: OrderQuote }
  | { kind: "unknown"; error: string };
const object = (raw: unknown): raw is Record<string, unknown> => Boolean(raw) && typeof raw === "object" && !Array.isArray(raw);
export const validSubmissionId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
const unknown = (): Recovery => ({ kind: "unknown", error: "The result is still uncertain. Check it, retry the same submission, or stop it before placing another order." });

export function readRecovery(raw: unknown, submission: Submission): Recovery {
  if (!object(raw) || raw.attemptId !== submission.id) return unknown();
  let submitted: Record<string, unknown> | null = null;
  try { submitted = submission.body ? JSON.parse(submission.body) : null; } catch { return unknown(); }
  if (raw.outcome === "accepted") {
    if (!object(raw.quote) || !Array.isArray(raw.quote.lines) || !raw.quote.lines.length || raw.quote.lines.length > 30) return unknown();
    const lines = submitted?.lines ?? raw.quote.lines;
    if (!Array.isArray(lines) || !lines.every(l => object(l) && typeof l.itemId === "string" && typeof l.qty === "number") || !isQuoteForSubmission(raw.quote, lines) || !sameTotals(raw.totals, raw.quote.totals)) return unknown();
    if (submitted && !quoteWasReviewed(submitted.lines, submitted.expectedTotals, raw.quote)) return unknown();
    if (raw.id !== submission.id || !Number.isSafeInteger(raw.number) || Number(raw.number) < 1 || !Number.isSafeInteger(raw.quotedMinutes) || Number(raw.quotedMinutes) < 0 || typeof raw.payAtPickup !== "boolean" || (submitted && raw.payAtPickup !== (submitted.payAtPickup === true))) return unknown();
    return { kind: "accepted", receipt: { id: submission.id, number: Number(raw.number), quotedMinutes: Number(raw.quotedMinutes), totalCents: raw.quote.totals.totalCents, payAtPickup: raw.payAtPickup, emailedTo: typeof submitted?.guestEmail === "string" ? submitted.guestEmail : "", status: "new" } };
  }
  if (raw.outcome === "cancelled") return { kind: "cancelled", error: "This submission was stopped. Nothing was ordered with it. You can review the cart and try again." };
  if (raw.outcome === "rejected") {
    if (typeof raw.error !== "string" || !raw.error || raw.error.length > 2000) return unknown();
    if (raw.priceChanged === true && submitted) {
      const lines = submitted.lines;
      if (!Array.isArray(lines) || !isQuoteForSubmission(raw.quote, lines)) return unknown();
      return { kind: "rejected", quote: raw.quote, error: "Prices or item requirements changed. Nothing was ordered. Review the updated total, then place your order again." };
    }
    return { kind: "rejected", error: raw.error };
  }
  return unknown();
}

/** One bounded operation only. An uncertain result never starts a new attempt. */
export async function recoverSubmission(submission: Submission, action: "submit" | "check" | "stop", fetcher: typeof fetch = fetch, timeoutMs = 12000): Promise<Recovery> {
  if (!validSubmissionId(submission.id) || (action === "submit" && !submission.body)) return unknown();
  const url = action === "submit" ? "/api/ordering/order" : action === "check" ? `/api/ordering/attempt?id=${submission.id}` : "/api/ordering/attempt";
  try {
    const result = await fetcher(url, { method: action === "check" ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(timeoutMs), ...(action === "check" ? {} : { headers: { "Content-Type": "application/json" }, body: action === "submit" ? submission.body : JSON.stringify({ attemptId: submission.id }) }) });
    return readRecovery(await result.json(), submission);
  } catch { return unknown(); }
}
