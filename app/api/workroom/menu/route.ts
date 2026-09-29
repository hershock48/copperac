import { unavailableWrite } from "@/lib/workroom/write-guard";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore } from "@/lib/workroom/store";
import { MENU_OVERRIDES_KEY, menuEditorState, menuEditorSnapshot } from "@/lib/content";
import { normalizePrice, priceError } from "@/lib/workroom/menu-def";
import { prepareMenuSave } from "@/lib/workroom/menu-write";

/**
 * The menu edits. GET is what the editor renders; PUT saves.
 *
 * The form posts EFFECTIVE values for every item. Only a value that differs
 * from the checked-in menu is stored as an edit, so a box typed back to the
 * original drops its edit and its badge together. Deleting every edit
 * leaves the site exactly as built: that is the whole contract.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const locked = () => NextResponse.json({ error: "Locked." }, { status: 401 });

export async function GET() {
  if (!(await isWorkroomAuthed())) return locked();
  return NextResponse.json(await menuEditorState());
}

export async function PUT(req: Request) {
  if (!(await isWorkroomAuthed())) return locked();
  const unavailable = unavailableWrite();
  if (unavailable) return unavailable;
  if (process.env.NODE_ENV === "production" && getStore().backend === "memory") return NextResponse.json({ error: "Persistent storage is required." }, { status: 503 });
  const body: unknown = await req.json().catch(() => null);
  const { raw, state } = await menuEditorSnapshot();
  const plan = prepareMenuSave(state, body, { normalizePrice, priceError });
  if (!plan.ok) return NextResponse.json({ error: plan.error, errors: plan.errors }, { status: plan.status });
  if (!(await getStore().compareAndSetValue(MENU_OVERRIDES_KEY, raw, plan.overrides))) return NextResponse.json({ error: "This menu changed. Compare the latest copy before saving." }, { status: 409 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, ...(await menuEditorState()) });
}
