// Cloud printing: per-station tickets over the Star CloudPRNT protocol.
//
// The shape, learned from Copper's own Toast setup: online orders print to
// TWO stations at once, and they are DIFFERENT documents. The kitchen ticket
// is what the pass needs (big number, items, mods, flags, no money). The
// front-of-house slip is what the handoff needs (totals, PAID ONLINE or DUE
// AT PICKUP, and tip + signature lines only when money is still owed).
//
// Protocol: the printer polls us. POST = "anything to print?" (we also record
// the poll as a heartbeat), GET = the job body, DELETE = the print result.
// A confirmed print on a KITCHEN printer auto-accepts the order: the paper in
// the kitchen IS the acceptance, no tablet tap needed. The chime-and-call
// path stays as the failure path when no kitchen printer is configured or
// polling.
//
// Printers are configured in ORDERING_PRINTERS (see .env.example): id, role
// (kitchen | front), and a token the device carries in its poll URL. Tokens
// gate the endpoint; a printer URL is a capability, treat it like one.
//
// v1 prints text/plain, which every CloudPRNT printer accepts: 42-column
// ASCII layout, cut after each job. Star Document Markup (bold, wide type)
// is a later upgrade behind the same interface; the templates are the only
// thing that would change.

import { ORDERING } from "./config";
import type { Order } from "./store";

export type PrinterRole = "kitchen" | "front";
export type PrinterConfig = { id: string; token: string; role: PrinterRole; label: string };

export function configuredPrinters(): PrinterConfig[] {
  const raw = process.env.ORDERING_PRINTERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PrinterConfig[];
    return parsed.filter((p) => p.id && p.token && (p.role === "kitchen" || p.role === "front"));
  } catch {
    // A malformed env var must not take orders down; printers just vanish
    // and the kitchen board shows none configured.
    return [];
  }
}

/* ------------------------------ templates ------------------------------ */

const W = 42; // columns on an 80mm printer at standard pitch

function line(ch = "-"): string {
  return ch.repeat(W);
}
function center(s: string): string {
  const pad = Math.max(0, Math.floor((W - s.length) / 2));
  return " ".repeat(pad) + s;
}
function row(left: string, right: string): string {
  const space = Math.max(1, W - left.length - right.length);
  return left + " ".repeat(space) + right;
}
function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function when(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ORDERING.timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

// The kitchen reads tickets, it does not study them: number and name first,
// items with quantity, each modifier indented under its item, flags shouted.
export function renderKitchenTicket(order: Order): string {
  const out: string[] = [];
  out.push(center("*** ONLINE ORDER ***"));
  out.push(center(`#${order.number}  ${order.guestName.toUpperCase()}`));
  out.push(center(`${when(order.createdAt)} · quoted ${order.quotedMinutes} min`));
  if (order.hasAlcohol) out.push(center(">>> ID CHECK AT PICKUP <<<"));
  out.push(line("="));
  for (const l of order.lines) {
    out.push(`${l.qty} x ${l.name}`);
    for (const opt of l.options) out.push(`     - ${opt}`);
    out.push("");
  }
  if (order.note) {
    out.push(line());
    out.push("NOTE: " + order.note);
  }
  out.push(line("="));
  out.push(center("copperac.com/order"));
  return out.join("\n") + "\n";
}

// The handoff slip: what the guest ordered, what it cost, and whether money
// still changes hands. Signature and tip lines exist ONLY when unpaid; a
// prepaid order needs a name and a bag, not a pen.
export function renderFrontSlip(order: Order): string {
  const out: string[] = [];
  out.push(center("COPPER ATHLETIC CLUB"));
  out.push(center("Online pickup order"));
  out.push(center(`#${order.number}  ${order.guestName}`));
  out.push(center(when(order.createdAt)));
  out.push(line("="));
  for (const l of order.lines) {
    out.push(row(`${l.qty} x ${l.name}`, money(l.lineCents)));
    for (const opt of l.options) out.push(`     ${opt}`);
  }
  out.push(line());
  out.push(row("Subtotal", money(order.subtotalCents)));
  out.push(row("Order fee", money(order.feeCents)));
  out.push(row("Tax", money(order.taxCents)));
  if (order.tipCents > 0) out.push(row("Tip", money(order.tipCents)));
  out.push(row("TOTAL", money(order.totalCents)));
  out.push(line("="));
  if (order.paid) {
    out.push(center("*** PAID ONLINE ***"));
    out.push(center("Nothing owed at pickup"));
  } else {
    out.push(center("*** DUE AT PICKUP ***"));
    out.push(row("Amount due", money(order.totalCents)));
    out.push("");
    out.push("Tip: _____________");
    out.push("");
    out.push("Total: ___________");
    out.push("");
    out.push("X ________________________________");
  }
  if (order.hasAlcohol) {
    out.push("");
    out.push(center("Contains alcohol: check ID (21+)"));
    out.push(center("Leaves sealed per Michigan law"));
  }
  out.push(line("="));
  out.push(center("Thanks for ordering direct."));
  return out.join("\n") + "\n";
}

export function renderFor(role: PrinterRole, order: Order): string {
  return role === "kitchen" ? renderKitchenTicket(order) : renderFrontSlip(order);
}
