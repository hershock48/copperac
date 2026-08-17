// The ordering demo's whole backend: one route, in-memory state.
//
// DEMO BOUNDARY, worth reading twice. State lives in this process's memory.
// On Vercel that means one warm serverless instance: orders survive minutes
// of quiet, not a redeploy, not a cold start, and two instances would each
// hold half the picture. That is the correct trade for a demo whose point is
// showing the flow, and it is exactly what the production build replaces with
// a real database. Nothing else changes shape when that lands: same actions,
// same JSON, a store that persists.
//
// Everything goes through this ONE route file on purpose: each App Router
// route deploys as its own function, so state split across routes would be
// split across processes. One file, one function, one memory.
//
// No auth on the kitchen actions, which is fine only because this is an
// unlinked, noindex demo on a protected preview. The production staff page
// gets a PIN. On the README checklist.

import { NextRequest, NextResponse } from "next/server";
import {
  BUSY_LEVELS,
  type BusyLevel,
  type DemoOrder,
  type OrderLine,
  itemById,
  orderTotals,
  quoteMinutes,
} from "@/lib/ordering";

export const dynamic = "force-dynamic";

type Store = {
  orders: DemoOrder[];
  eightySixed: string[];
  busy: BusyLevel;
  nextNumber: number;
};

// globalThis rather than a module const so dev-server hot reloads keep the
// board's state instead of quietly emptying it mid-demo.
const g = globalThis as typeof globalThis & { __copperOrdering?: Store };
function store(): Store {
  g.__copperOrdering ??= {
    orders: [],
    eightySixed: [],
    busy: "normal",
    nextNumber: 1,
  };
  return g.__copperOrdering;
}

function stateFor(scope: "guest" | "kitchen") {
  const s = store();
  const base = {
    eightySixed: s.eightySixed,
    busy: s.busy,
    quoteMinutes: quoteMinutes(s.busy),
  };
  if (scope === "guest") return base;
  return {
    ...base,
    orders: [...s.orders].sort((a, b) => {
      // New orders first, newest of the new on top; accepted below, newest first.
      if (a.status !== b.status) return a.status === "new" ? -1 : 1;
      return b.placedAt - a.placedAt;
    }),
  };
}

export async function GET(req: NextRequest) {
  const scope =
    req.nextUrl.searchParams.get("scope") === "kitchen" ? "kitchen" : "guest";
  return NextResponse.json(stateFor(scope));
}

// Caps, so a stray script can't balloon the demo store. Not security, hygiene.
const MAX_LINES = 40;
const MAX_QTY = 20;
const MAX_NAME = 60;
const MAX_NOTE = 140;

type PlaceBody = {
  action: "place";
  guestName?: unknown;
  tipCents?: unknown;
  lines?: unknown;
};

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function placeOrder(body: PlaceBody) {
  const s = store();
  if (s.busy === "paused") {
    return badRequest("paused");
  }

  const guestName =
    typeof body.guestName === "string" ? body.guestName.trim().slice(0, MAX_NAME) : "";
  if (!guestName) return badRequest("name_required");

  const tipCents =
    typeof body.tipCents === "number" &&
    Number.isInteger(body.tipCents) &&
    body.tipCents >= 0 &&
    body.tipCents <= 50_000
      ? body.tipCents
      : 0;

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return badRequest("empty_order");
  }
  if (body.lines.length > MAX_LINES) return badRequest("too_many_lines");

  // The server prices every line itself. A cart that trusts client prices is
  // a cart that sells $15 cheesesteaks for a penny.
  const lines: OrderLine[] = [];
  for (const raw of body.lines) {
    if (typeof raw !== "object" || raw === null) return badRequest("bad_line");
    const { id, qty, note } = raw as { id?: unknown; qty?: unknown; note?: unknown };
    if (typeof id !== "string") return badRequest("bad_line");
    const item = itemById(id);
    if (!item) return badRequest("unknown_item");
    if (s.eightySixed.includes(id)) {
      return NextResponse.json(
        { error: "sold_out", itemName: item.name },
        { status: 409 }
      );
    }
    const q =
      typeof qty === "number" && Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY
        ? qty
        : 1;
    lines.push({
      id,
      name: item.name,
      priceCents: item.priceCents,
      qty: q,
      note:
        typeof note === "string" && note.trim()
          ? note.trim().slice(0, MAX_NOTE)
          : undefined,
    });
  }

  const order: DemoOrder = {
    id: `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    number: s.nextNumber++,
    guestName,
    lines,
    ...orderTotals(lines, tipCents),
    quoteMinutes: quoteMinutes(s.busy),
    status: "new",
    placedAt: Date.now(),
  };
  s.orders.push(order);
  // The board keeps the last 60. A demo does not need history and unbounded
  // arrays in a warm lambda are how demos fall over on day three.
  if (s.orders.length > 60) s.orders = s.orders.slice(-60);

  return NextResponse.json({ order });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("bad_json");
  }

  const s = store();
  switch (body.action) {
    case "place":
      return placeOrder(body as PlaceBody);

    case "accept": {
      const order = s.orders.find((o) => o.id === body.orderId);
      if (!order) return badRequest("unknown_order");
      order.status = "accepted";
      return NextResponse.json(stateFor("kitchen"));
    }

    case "eightysix": {
      const { id, on } = body as { id?: unknown; on?: unknown };
      if (typeof id !== "string" || !itemById(id)) return badRequest("unknown_item");
      const listed = s.eightySixed.includes(id);
      if (on && !listed) s.eightySixed.push(id);
      if (!on && listed) s.eightySixed = s.eightySixed.filter((x) => x !== id);
      return NextResponse.json(stateFor("kitchen"));
    }

    case "busy": {
      const { level } = body as { level?: unknown };
      if (!BUSY_LEVELS.some((b) => b.level === level)) return badRequest("bad_level");
      s.busy = level as BusyLevel;
      return NextResponse.json(stateFor("kitchen"));
    }

    default:
      return badRequest("unknown_action");
  }
}
