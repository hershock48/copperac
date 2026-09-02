import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore } from "@/lib/workroom/store";
import { MENU_OVERRIDES_KEY, menuEditorState } from "@/lib/content";
import { normalizePrice, priceError, type MenuOverrides } from "@/lib/workroom/menu-def";

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
  const body = (await req.json().catch(() => null)) as { items?: Record<string, unknown> } | null;
  if (!body?.items || typeof body.items !== "object") return NextResponse.json({ error: "Malformed." }, { status: 400 });

  // Only keys this build's menu knows are even looked at.
  const state = await menuEditorState();
  const builtIn = new Map<string, { price: string; desc: string }>();
  for (const m of state.menus) for (const s of m.sections) for (const i of s.items) builtIn.set(i.key, { price: i.builtInPrice, desc: i.builtInDesc });

  const overrides: MenuOverrides = {};
  const errors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(body.items)) {
    const base = builtIn.get(key);
    if (!base || !raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const price = typeof r.price === "string" ? r.price.replace(/^\$/, "").trim() : base.price;
    const desc = typeof r.desc === "string" ? r.desc.replace(/[\r\n]+/g, " ").trim().slice(0, 400) : base.desc;
    const hidden = r.hidden === true;
    const err = priceError(price);
    if (err) {
      errors[key] = err;
      continue;
    }
    const o: MenuOverrides[string] = {};
    // An empty price on an item that has a built-in one means "back to the
    // built-in". Pie of the Month has none built in, and stays that way.
    const normalized = price === "" ? base.price : normalizePrice(price);
    if (normalized !== base.price) o.price = normalized;
    if (desc !== base.desc) o.desc = desc;
    if (hidden) o.hidden = true;
    if (Object.keys(o).length > 0) overrides[key] = o;
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Check the marked prices.", errors }, { status: 400 });
  }

  await getStore().setValue(MENU_OVERRIDES_KEY, overrides);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, ...(await menuEditorState()) });
}
