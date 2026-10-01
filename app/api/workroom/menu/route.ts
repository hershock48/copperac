import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore, newId } from "@/lib/workroom/store";
import { MENU_ADDITIONS_KEY, MENU_OVERRIDES_KEY, menuEditorState } from "@/lib/content";
import {
  MENU_IDS,
  additionError,
  normalizePrice,
  priceError,
  type MenuAddition,
  type MenuId,
  type MenuOverrides,
} from "@/lib/workroom/menu-def";

/**
 * The menu edits. GET is what the editor renders; PUT saves.
 *
 * Two things come in one PUT, because the planner sees one screen and one
 * Save button:
 *
 *   items       EFFECTIVE values for every printed item. Only a value that
 *               differs from the checked-in menu is stored as an edit, so a
 *               box typed back to the original drops its edit and its badge
 *               together.
 *
 *   additions   the club's own items, the whole list, replacing what was
 *               stored. A row missing from the list is a row she removed.
 *               Absent from the body altogether (an older tab still open),
 *               the stored additions stay as they are.
 *
 * Deleting every edit of both kinds leaves the site exactly as built: that
 * is the whole contract.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const locked = () => NextResponse.json({ error: "Locked." }, { status: 401 });

/** Additions are a handful a month; this stops a runaway client, not a planner. */
const MAX_ADDITIONS = 200;

export async function GET() {
  if (!(await isWorkroomAuthed())) return locked();
  return NextResponse.json(await menuEditorState());
}

export async function PUT(req: Request) {
  if (!(await isWorkroomAuthed())) return locked();
  const body = (await req.json().catch(() => null)) as { items?: Record<string, unknown>; additions?: unknown } | null;
  if (!body?.items || typeof body.items !== "object") return NextResponse.json({ error: "Malformed." }, { status: 400 });

  // Only keys this build's menu knows are even looked at.
  const state = await menuEditorState();
  const builtIn = new Map<string, { price: string; desc: string }>();
  // Names already taken in each section, lowercased, so an addition cannot
  // shadow a printed item or another addition (the menu keys its rows by name).
  const taken = new Map<string, Set<string>>();
  for (const m of state.menus) {
    for (const s of m.sections) {
      taken.set(`${m.id}|${s.name}`, new Set(s.items.map((i) => i.name.toLowerCase())));
      for (const i of s.items) builtIn.set(i.key, { price: i.builtInPrice, desc: i.builtInDesc });
    }
  }

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

  // The additions, when the client sent the list. Errors are keyed by the id
  // the client used (a tmp_ id for an unsaved row), so the editor can mark
  // the row; a saved id is kept, anything else is minted fresh.
  let additions: MenuAddition[] | null = null;
  if (Array.isArray(body.additions)) {
    additions = [];
    if (body.additions.length > MAX_ADDITIONS) {
      return NextResponse.json({ error: `That is more than ${MAX_ADDITIONS} added items. Something is off.` }, { status: 400 });
    }
    for (const raw of body.additions) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const clientId = typeof r.id === "string" ? r.id.slice(0, 60) : newId("tmp");
      if (!MENU_IDS.includes(r.menu as MenuId)) {
        errors[clientId] = "Which menu is this on?";
        continue;
      }
      const a: MenuAddition = {
        id: /^add_[a-z0-9]+$/.test(clientId) ? clientId : newId("add"),
        menu: r.menu as MenuId,
        section: typeof r.section === "string" ? r.section.replace(/\s+/g, " ").trim() : "",
        name: typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim() : "",
        desc: typeof r.desc === "string" ? r.desc.replace(/[\r\n]+/g, " ").trim() : "",
        price: typeof r.price === "string" ? r.price.replace(/^\$/, "").trim() : "",
      };
      const err = additionError(a);
      if (err) {
        errors[clientId] = err;
        continue;
      }
      const sectionKey = `${a.menu}|${a.section}`;
      const names = taken.get(sectionKey) ?? new Set<string>();
      if (names.has(a.name.toLowerCase())) {
        errors[clientId] = `There is already a "${a.name}" in ${a.section}.`;
        continue;
      }
      names.add(a.name.toLowerCase());
      taken.set(sectionKey, names);
      additions.push({ ...a, price: a.price === "" ? "" : normalizePrice(a.price) });
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Check the marked rows.", errors }, { status: 400 });
  }

  const store = getStore();
  await store.setValue(MENU_OVERRIDES_KEY, overrides);
  if (additions !== null) await store.setValue(MENU_ADDITIONS_KEY, additions);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, ...(await menuEditorState()) });
}
