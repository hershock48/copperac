// The online ordering demo: shared types, constants and money math.
//
// This file is safe to import from both the client pages and the API route.
// It holds no state; the demo's state lives in app/api/ordering/route.ts.
//
// Money is integer cents everywhere. Floats drift ("0.1 + 0.2"), and an
// ordering page that shows a total off by a cent teaches the guest the math
// is sloppy. Prices in lib/menu.ts are strings; they get parsed once, here.

import { FOOD_MENU, type MenuSection } from "@/lib/menu";

// ── The fee ─────────────────────────────────────────────────────────────────
// 99¢ per order, disclosed on the menu page before checkout, never a surprise
// at payment. Guests see the fee; the 50/50 split with the house is business
// copy and belongs on the kitchen board and in the pitch, not in the cart.
export const ORDER_FEE_CENTS = 99;
export const FEE_SHARE_CENTS = 50; // the house's half, shown on /kitchen

// Michigan's 6% on prepared food. The demo estimates tax so the total looks
// like a real total; the production build gets the rate and the fee's
// taxability confirmed by a Michigan tax advisor before real money runs.
export const TAX_RATE = 0.06;

// DEMO DEFAULT. Real per-item prep times come from the kitchen, not from us.
// On the README checklist; ask, do not infer.
export const BASE_PREP_MIN = 20;

// ── The busy dial ───────────────────────────────────────────────────────────
// Quoted pickup time = base prep + the dial. Staff set it from /kitchen.
export type BusyLevel = "normal" | "busy" | "slammed" | "paused";
export const BUSY_LEVELS: { level: BusyLevel; label: string; addMin: number }[] = [
  { level: "normal", label: "Normal", addMin: 0 },
  { level: "busy", label: "Busy +15", addMin: 15 },
  { level: "slammed", label: "Slammed +30", addMin: 30 },
  { level: "paused", label: "Pause", addMin: 0 },
];

export function quoteMinutes(busy: BusyLevel): number {
  const found = BUSY_LEVELS.find((b) => b.level === busy);
  return BASE_PREP_MIN + (found?.addMin ?? 0);
}

// ── The orderable menu ──────────────────────────────────────────────────────
// The whole food menu, cocktails included: the Toast page this replaces sells
// cocktails to go, so this does too. Items get stable ids so the 86 list and
// cart lines survive a menu re-render.

export type OrderableItem = {
  id: string;
  name: string;
  desc: string;
  priceCents: number;
};
export type OrderableSection = {
  name: string;
  note?: string;
  items: OrderableItem[];
};

export function priceToCents(p: string): number {
  const n = Number(p);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toOrderable(sections: MenuSection[]): OrderableSection[] {
  return sections.map((s) => ({
    name: s.name,
    note:
      s.name === "Cocktails"
        ? "Sealed for carryout. 21 and up, ID checked at pickup."
        : undefined,
    items: s.items.map((i) => ({
      // Section in the id: "Caesar Salad" exists in both Salads and Sides,
      // and two items sharing an id would 86 each other.
      id: `${slug(s.name)}--${slug(i.name)}`,
      name: i.name,
      desc: i.desc,
      priceCents: priceToCents(i.price),
    })),
  }));
}

export const ORDERABLE_MENU: OrderableSection[] = toOrderable(FOOD_MENU);

const BY_ID = new Map(
  ORDERABLE_MENU.flatMap((s) => s.items).map((i) => [i.id, i])
);
export function itemById(id: string): OrderableItem | undefined {
  return BY_ID.get(id);
}

// ── Orders ──────────────────────────────────────────────────────────────────

export type OrderLine = {
  id: string;
  name: string;
  priceCents: number;
  qty: number;
  note?: string;
};

export type DemoOrder = {
  id: string;
  number: number; // short, human: "Order 14"
  guestName: string;
  lines: OrderLine[];
  subtotalCents: number;
  feeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  quoteMinutes: number;
  status: "new" | "accepted";
  placedAt: number; // epoch ms
};

export function orderTotals(lines: OrderLine[], tipCents: number) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const feeCents = ORDER_FEE_CENTS;
  // Tax on food plus the fee, never on the tip. Tips pass through whole.
  const taxCents = Math.round((subtotalCents + feeCents) * TAX_RATE);
  return {
    subtotalCents,
    feeCents,
    taxCents,
    tipCents,
    totalCents: subtotalCents + feeCents + taxCents + tipCents,
  };
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
