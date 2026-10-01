import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWorkroomAuthed } from "@/lib/workroom/auth";
import { getStore, newId } from "@/lib/workroom/store";
import { MENU_ADDITIONS_KEY, MENU_OVERRIDES_KEY, getMenuOverrides, menuEditorState } from "@/lib/content";
import {
  MENU_IDS,
  additionErrors,
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
 * Errors come back keyed by row: a printed item by its key, an added row by
 * "<its id>:<field>" (section, name, desc or price), so the editor can mark
 * the box that is wrong rather than the row.
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
  // The section the menu page swaps for Scooplist's live list; an addition
  // filed there would save and never render, so it is refused instead.
  const live = new Set<string>();
  for (const m of state.menus) {
    for (const s of m.sections) {
      if (s.live) live.add(`${m.id}|${s.name}`);
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
  // the client used (a tmp_ id for an unsaved row) and the field, so the
  // editor can mark the box. A saved id is kept once; a repeat of it, or
  // anything else, is minted fresh, since the read side drops a second row
  // with a known id and that would lose an item without a word.
  let additions: MenuAddition[] | null = null;
  if (Array.isArray(body.additions)) {
    additions = [];
    if (body.additions.length > MAX_ADDITIONS) {
      return NextResponse.json({ error: `That is more than ${MAX_ADDITIONS} added items. Something is off.` }, { status: 400 });
    }
    const ids = new Set<string>();
    for (const raw of body.additions) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const clientId = typeof r.id === "string" ? r.id.slice(0, 60) : newId("tmp");
      if (!MENU_IDS.includes(r.menu as MenuId)) {
        errors[`${clientId}:section`] = "Which menu is this on?";
        continue;
      }
      const keepId = /^add_[a-z0-9]+$/.test(clientId) && !ids.has(clientId);
      const a: MenuAddition = {
        id: keepId ? clientId : newId("add"),
        menu: r.menu as MenuId,
        section: typeof r.section === "string" ? r.section.replace(/\s+/g, " ").trim() : "",
        name: typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim() : "",
        desc: typeof r.desc === "string" ? r.desc.replace(/[\r\n]+/g, " ").trim() : "",
        price: typeof r.price === "string" ? r.price.replace(/^\$/, "").trim() : "",
      };
      const errs = additionErrors(a);
      if (Object.keys(errs).length > 0) {
        for (const [field, msg] of Object.entries(errs)) errors[`${clientId}:${field}`] = msg;
        continue;
      }
      const sectionKey = `${a.menu}|${a.section}`;
      if (live.has(sectionKey)) {
        errors[`${clientId}:section`] = `${a.section} come from the Scooplist board, so add it there.`;
        continue;
      }
      const names = taken.get(sectionKey) ?? new Set<string>();
      if (names.has(a.name.toLowerCase())) {
        errors[`${clientId}:name`] = `There is already a "${a.name}" in ${a.section}.`;
        continue;
      }
      names.add(a.name.toLowerCase());
      taken.set(sectionKey, names);
      ids.add(a.id);
      additions.push({ ...a, price: a.price === "" ? "" : normalizePrice(a.price) });
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Check the marked rows.", errors }, { status: 400 });
  }

  // Two rows, one Save. There is no transaction across setValue, so if the
  // second write fails the first is put back the way it was, best effort,
  // and the answer is "nothing saved" rather than a half-saved menu behind
  // an error message. revalidatePath runs only once both are in.
  const store = getStore();
  const before = await getMenuOverrides();
  try {
    await store.setValue(MENU_OVERRIDES_KEY, overrides);
    if (additions !== null) {
      try {
        await store.setValue(MENU_ADDITIONS_KEY, additions);
      } catch (err) {
        await store.setValue(MENU_OVERRIDES_KEY, before).catch(() => {});
        throw err;
      }
    }
  } catch (err) {
    console.error("[workroom] menu save failed", err);
    return NextResponse.json({ error: "The database did not answer. Nothing was saved." }, { status: 500 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, ...(await menuEditorState()) });
}
