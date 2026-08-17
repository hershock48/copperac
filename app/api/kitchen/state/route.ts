// The three staff controls: 86 toggles, the busy dial, pause with auto-resume.
//
// PATCH takes partial updates so each button on the kitchen screen is one
// small honest request. Pause is minutes from now, never a raw timestamp and
// never open-ended: the server computes pausedUntil, and reads through
// effectiveState() so an expired pause is over even if nobody taps resume.

import { NextRequest, NextResponse } from "next/server";
import { isKitchenAuthed } from "@/lib/ordering/auth";
import { buildIndex, loadMenuDoc, toOrderable } from "@/lib/ordering/menu";
import { effectiveState, getStore, type KitchenState } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKitchenAuthed())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const store = getStore();
  const state = effectiveState(await store.getState());
  // Printer health rides along: a printer is online if it polled recently
  // (polls run every few seconds; 60s of silence means unplugged, dead
  // network, or powered off, and the board shows it red).
  const { configuredPrinters } = await import("@/lib/ordering/printing");
  const seen = await store.printerLastSeen();
  const printers = configuredPrinters().map((p) => ({
    id: p.id,
    label: p.label,
    role: p.role,
    online: Date.now() - (seen[p.id] ?? 0) < 60_000,
  }));
  return NextResponse.json({ state, backend: store.backend, printers });
}

type Patch = {
  toggle86?: string;
  busyMinutes?: number;
  pauseMinutes?: number; // 0 resumes
};

const BUSY_VALUES = new Set([0, 15, 30]);
const PAUSE_VALUES = new Set([0, 30, 60, 90]);

export async function PATCH(req: NextRequest) {
  if (!(await isKitchenAuthed())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  let patch: Patch;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const store = getStore();
  const state: KitchenState = effectiveState(await store.getState());

  if (typeof patch.toggle86 === "string") {
    const index = buildIndex(toOrderable(await loadMenuDoc(store), { includeHidden: true }));
    if (!index.has(patch.toggle86)) {
      return NextResponse.json({ error: "No such item." }, { status: 400 });
    }
    state.unavailable = state.unavailable.includes(patch.toggle86)
      ? state.unavailable.filter((id) => id !== patch.toggle86)
      : [...state.unavailable, patch.toggle86];
  }

  if (patch.busyMinutes !== undefined) {
    if (!BUSY_VALUES.has(patch.busyMinutes)) {
      return NextResponse.json({ error: "Busy value out of range." }, { status: 400 });
    }
    state.busyMinutes = patch.busyMinutes as KitchenState["busyMinutes"];
  }

  if (patch.pauseMinutes !== undefined) {
    if (!PAUSE_VALUES.has(patch.pauseMinutes)) {
      return NextResponse.json({ error: "Pause value out of range." }, { status: 400 });
    }
    state.pausedUntil = patch.pauseMinutes === 0 ? null : Date.now() + patch.pauseMinutes * 60000;
  }

  await store.setState(state);
  return NextResponse.json({ state });
}
