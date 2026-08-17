// The three staff controls: 86 toggles, the busy dial, pause with auto-resume.
//
// PATCH takes partial updates so each button on the kitchen screen is one
// small honest request. Pause is minutes from now, never a raw timestamp and
// never open-ended: the server computes pausedUntil, and reads through
// effectiveState() so an expired pause is over even if nobody taps resume.

import { NextRequest, NextResponse } from "next/server";
import { isKitchenAuthed } from "@/lib/ordering/auth";
import { ITEM_INDEX } from "@/lib/ordering/menu";
import { effectiveState, getStore, type KitchenState } from "@/lib/ordering/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKitchenAuthed())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const store = getStore();
  const state = effectiveState(await store.getState());
  return NextResponse.json({ state, backend: store.backend });
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
    if (!ITEM_INDEX.has(patch.toggle86)) {
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
