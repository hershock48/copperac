import "server-only";

import { BRUNCH_MENU, COCKTAILS, FOOD_MENU, RESERVE_MENU, type MenuSection } from "@/lib/menu";
import { EVENTS, type CACEvent } from "@/lib/site";
import { getStore } from "@/lib/workroom/store";
import type { EventsContact, WorkroomEvent } from "@/lib/workroom/events-def";
import {
  MENU_IDS,
  menuItemKey,
  type MenuAddition,
  type MenuId,
  type MenuOverrides,
  orderIds,
  sectionKey,
  type MenuOrder,
} from "@/lib/workroom/menu-def";

/**
 * The content seam: what the customer pages read instead of lib/site.ts and
 * lib/menu.ts directly, for everything the workroom can edit.
 *
 * The checked-in files stay exactly what they were: the seed and the safety
 * net. This file lays the workroom's stored edits over them; where no edit
 * exists the site renders exactly as it did before the workroom existed,
 * database or no database. Deleting every edit can only put the site back to
 * its checked-in state, which is what makes "you cannot break the site from
 * this screen" true.
 *
 * Pages stay static. This runs at build and revalidate time; every workroom
 * save calls revalidatePath("/", "layout"), so an edit is live within
 * seconds without making any customer route dynamic.
 */

const TZ = "America/Detroit";
const EVENT_GRACE_MS = 4 * 60 * 60 * 1000;
export const EVENTS_CONTACT_KEY = "events-contact";
export const MENU_OVERRIDES_KEY = "menu-overrides";
export const MENU_ADDITIONS_KEY = "menu-additions";
export const MENU_ORDER_KEY = "menu-order";

/**
 * The one section the menu page swaps for Scooplist's live list: the
 * printed cocktails on the main menu. Its printed items are the fallback
 * when the board is down, so they can be edited; nothing can be added to
 * it from the workroom, and it is never dropped from the menu even when
 * every printed item is switched off, because the page finds it by name
 * to put the live rows in.
 */
export function isLiveSection(menu: MenuId, section: string): boolean {
  return menu === "food" && section === COCKTAILS.name;
}

/** Every printed menu the workroom can lay edits over, by id. */
const PRINTED_MENUS = [
  ["food", FOOD_MENU],
  ["brunch", BRUNCH_MENU],
  ["reserve", RESERVE_MENU],
] as const;

/* ------------------------------ events ------------------------------ */

/** The instant for a Detroit wall-clock date and time, as an ISO string. */
function detroitISO(date: string, time: string): string {
  const wall = `${date}T${time}:00`;
  for (const offset of ["-04:00", "-05:00"]) {
    const d = new Date(`${wall}${offset}`);
    const back = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => back.find((p) => p.type === t)?.value ?? "";
    const hour = get("hour") === "24" ? "00" : get("hour");
    if (`${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}` === wall) return `${wall}${offset}`;
  }
  return `${wall}-05:00`;
}

function clock(time: string): { h: number; m: number; ampm: "AM" | "PM"; text: string } {
  const [hh, mm] = time.split(":").map(Number);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return { h, m: mm, ampm, text: `${h}:${String(mm).padStart(2, "0")}` };
}

/** "7:00 – 9:00 PM", "11:00 AM – 1:00 PM", or "7:00 PM" with no end. */
function timeRange(start: string, end: string): string {
  const s = clock(start);
  if (!end) return `${s.text} ${s.ampm}`;
  const e = clock(end);
  return s.ampm === e.ampm ? `${s.text} – ${e.text} ${e.ampm}` : `${s.text} ${s.ampm} – ${e.text} ${e.ampm}`;
}

function displayDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(
    new Date(iso)
  );
}

export function toSiteEvent(e: WorkroomEvent): CACEvent {
  const date = detroitISO(e.date, e.startTime);
  return {
    slug: e.id,
    title: e.title.trim(),
    date,
    displayDate: displayDate(date),
    time: timeRange(e.startTime, e.endTime),
    price: e.price.trim() || undefined,
    ticketUrl: e.ticketUrl.trim() || undefined,
    image: e.imageId ? `/img/events/${e.imageId}` : undefined,
    imageAlt: e.imageAlt.trim() || undefined,
    details: e.details
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

/** Every event the site could show: the workroom's published rows plus the
    checked-in seed, seed rows yielding to a workroom row of the same slug.
    A stored row the formatter cannot read (a time or date no client of
    this build should have saved) is skipped, never thrown: one bad row
    must not take the homepage and /events down for every visitor. */
async function allSiteEvents(): Promise<CACEvent[]> {
  const stored = await getStore().events.list();
  const fromWorkroom: CACEvent[] = [];
  for (const e of stored) {
    if (!e.published) continue;
    try {
      fromWorkroom.push(toSiteEvent(e));
    } catch (err) {
      console.error(`[content] skipping event ${e.id}: ${e.date} ${e.startTime} does not format`, err);
    }
  }
  const taken = new Set(fromWorkroom.map((e) => e.slug));
  return [...fromWorkroom, ...EVENTS.filter((e) => !taken.has(e.slug))];
}

export async function getUpcomingEvents(now: Date = new Date()): Promise<CACEvent[]> {
  const cutoff = now.getTime() - EVENT_GRACE_MS;
  return (await allSiteEvents())
    .filter((e) => new Date(e.date).getTime() >= cutoff)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
}

export async function getEventsContact(): Promise<EventsContact> {
  const stored = await getStore().getValue<Partial<EventsContact>>(EVENTS_CONTACT_KEY);
  return {
    name: typeof stored?.name === "string" ? stored.name : "",
    email: typeof stored?.email === "string" ? stored.email : "",
    phone: typeof stored?.phone === "string" ? stored.phone : "",
  };
}

/* ------------------------------- menus ------------------------------- */

export async function getMenuOverrides(): Promise<MenuOverrides> {
  const stored = await getStore().getValue<MenuOverrides>(MENU_OVERRIDES_KEY);
  if (!stored || typeof stored !== "object") return {};
  // Re-filter on read: only keys that name an item this build knows, only
  // the whitelisted fields, so a row from another build cannot misprice.
  const known = new Set<string>();
  for (const [menu, sections] of PRINTED_MENUS) {
    for (const s of sections) for (const i of s.items) known.add(menuItemKey(menu, s.name, i.name));
  }
  const clean: MenuOverrides = {};
  for (const [key, raw] of Object.entries(stored)) {
    if (!known.has(key) || !raw || typeof raw !== "object") continue;
    const o: MenuOverrides[string] = {};
    if (typeof raw.price === "string" && raw.price !== "") o.price = raw.price;
    if (typeof raw.desc === "string") o.desc = raw.desc;
    if (raw.hidden === true) o.hidden = true;
    if (Object.keys(o).length > 0) clean[key] = o;
  }
  return clean;
}

/**
 * The items the club added from the workroom, re-checked on read the same
 * way the overrides are: a row this code cannot make sense of is dropped,
 * never rendered half-right. Stored in insertion order, which is the order
 * they show in their section.
 */
export async function getMenuAdditions(): Promise<MenuAddition[]> {
  const stored = await getStore().getValue<unknown>(MENU_ADDITIONS_KEY);
  if (!Array.isArray(stored)) return [];
  // Names the print already uses, per section, so an addition cannot shadow
  // a printed item. The save route refuses the twin at write time; this is
  // the read-time half, for the day lib/menu.ts catches up to the print and
  // gains the very item she added in the meantime. Her copy yields.
  const printed = new Set<string>();
  for (const [menu, sections] of PRINTED_MENUS) {
    for (const s of sections) for (const i of s.items) printed.add(`${menu}|${s.name}|${i.name.toLowerCase()}`);
  }
  const clean: MenuAddition[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const raw of stored) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || !/^add_[a-z0-9]+$/.test(r.id) || ids.has(r.id)) continue;
    if (!MENU_IDS.includes(r.menu as MenuId)) continue;
    if (typeof r.section !== "string" || typeof r.name !== "string") continue;
    const section = r.section.trim().slice(0, 60);
    const name = r.name.trim().slice(0, 80);
    if (!section || !name) continue;
    // The live section belongs to Scooplist (see isLiveSection); nothing added here could render.
    if (isLiveSection(r.menu as MenuId, section)) continue;
    const nameKey = `${r.menu}|${section}|${name.toLowerCase()}`;
    if (printed.has(nameKey) || names.has(nameKey)) continue;
    const price = typeof r.price === "string" && /^\d{1,3}\.\d{2}$/.test(r.price) ? r.price : "";
    const desc = typeof r.desc === "string" ? r.desc.slice(0, 400) : "";
    // Rows saved before the field existed have no unit: a flat price.
    const unit = typeof r.unit === "string" ? r.unit.trim().slice(0, 30) : "";
    ids.add(r.id);
    names.add(nameKey);
    clean.push({ id: r.id, menu: r.menu as MenuId, section, name, desc, price, unit });
  }
  return clean;
}

/**
 * The saved row order, re-checked on read: only "menu|section" keys on a
 * menu this build knows, only lists of short strings. Ids that name no
 * row are left in and skipped by orderIds at render, so a row hidden for
 * the season comes back where it was.
 */
export async function getMenuOrder(): Promise<MenuOrder> {
  const stored = await getStore().getValue<unknown>(MENU_ORDER_KEY);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const clean: MenuOrder = {};
  for (const [key, list] of Object.entries(stored as Record<string, unknown>)) {
    const menu = key.slice(0, key.indexOf("|"));
    if (!MENU_IDS.includes(menu as MenuId) || !Array.isArray(list)) continue;
    const ids = list.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 200).slice(0, 500);
    if (ids.length > 0) clean[key] = ids;
  }
  return clean;
}

function applyEdits(
  menu: MenuId,
  sections: MenuSection[],
  overrides: MenuOverrides,
  additions: MenuAddition[],
  order: MenuOrder
): MenuSection[] {
  const mine = additions.filter((a) => a.menu === menu);
  // The Reserve menu's own rule, printed on it: everything is per person
  // unless the unit says otherwise. So an added Reserve item with an empty
  // unit reads "per person" too, and "each" is how a flat price is said.
  // Abbie's dessert nachos were saved before the unit field existed and
  // read "$6" until this (20 Oct 2026); nothing in the workroom was needed.
  const asItem = (a: MenuAddition) => ({
    name: a.name,
    desc: a.desc,
    price: a.price,
    unit: a.unit || (menu === "reserve" ? "per person" : undefined),
  });
  type Item = MenuSection["items"][number];
  // Every row keyed by its id, then laid out in the saved order. Without one
  // that is the printed items and then hers, which is how it always read.
  const ordered = (name: string, rows: [string, Item | null][]): Item[] => {
    const byId = new Map(rows);
    return orderIds(
      rows.map(([id]) => id),
      order[sectionKey(menu, name)]
    )
      .map((id) => byId.get(id) ?? null)
      .filter((i): i is Item => i !== null);
  };
  const out: MenuSection[] = sections.map((s) => ({
    ...s,
    items: ordered(s.name, [
      ...s.items.map((i): [string, Item | null] => {
        const key = menuItemKey(menu, s.name, i.name);
        const o = overrides[key];
        if (!o) return [key, i];
        if (o.hidden) return [key, null];
        return [key, { ...i, price: o.price ?? i.price, desc: o.desc ?? i.desc }];
      }),
      ...mine.filter((a) => a.section === s.name).map((a): [string, Item] => [a.id, asItem(a)]),
    ]),
  }));
  // A section the print does not have comes after the printed ones, in the
  // order the club first used its name.
  const known = new Set(sections.map((s) => s.name));
  for (const a of mine) {
    if (known.has(a.section)) continue;
    known.add(a.section);
    out.push({
      name: a.section,
      items: ordered(
        a.section,
        mine.filter((x) => x.section === a.section).map((x): [string, Item] => [x.id, asItem(x)])
      ),
    });
  }
  return out.filter((s) => s.items.length > 0 || isLiveSection(menu, s.name));
}

/**
 * The menus as the site renders them. The cocktails section keeps its
 * checked-in name so the menu page can still swap it for the live Scooplist
 * list (it matches by name, since these are new objects).
 */
export async function getMenus(): Promise<{
  food: MenuSection[];
  brunch: MenuSection[];
  /** The Copper Reserve's buffet menu (1 Oct 2026), priced per person; see RESERVE_MENU. */
  reserve: MenuSection[];
  cocktailsName: string;
}> {
  const [overrides, additions, order] = await Promise.all([getMenuOverrides(), getMenuAdditions(), getMenuOrder()]);
  return {
    food: applyEdits("food", FOOD_MENU, overrides, additions, order),
    brunch: applyEdits("brunch", BRUNCH_MENU, overrides, additions, order),
    reserve: applyEdits("reserve", RESERVE_MENU, overrides, additions, order),
    cocktailsName: COCKTAILS.name,
  };
}

export type MenuEditorItem = {
  key: string;
  name: string;
  builtInPrice: string;
  builtInDesc: string;
  price: string;
  desc: string;
  hidden: boolean;
  edited: boolean;
};

export type MenuEditorState = {
  /** The printed menus, with the overrides laid on. A `live` section is the
      cocktails list, which the menu page swaps for Scooplist's rows: its
      printed items can still be edited (they are the fallback when the feed
      is down) but nothing can be added to it from here. */
  menus: { id: MenuId; label: string; sections: { name: string; live: boolean; items: MenuEditorItem[] }[] }[];
  /** The club's own items, every menu together; the editor files them by menu and section. */
  additions: MenuAddition[];
  /** The saved row order per section; the editor lays rows out with orderIds, as the site does. */
  order: MenuOrder;
  backend: "postgres" | "memory";
};

export async function menuEditorState(): Promise<MenuEditorState> {
  const [overrides, additions, order] = await Promise.all([getMenuOverrides(), getMenuAdditions(), getMenuOrder()]);
  const build = (id: MenuId, label: string, sections: MenuSection[]) => ({
    id,
    label,
    sections: sections.map((s) => ({
      name: s.name,
      live: isLiveSection(id, s.name),
      items: s.items.map((i) => {
        const key = menuItemKey(id, s.name, i.name);
        const o = overrides[key];
        return {
          key,
          name: i.name,
          builtInPrice: i.price,
          builtInDesc: i.desc,
          price: o?.price ?? i.price,
          desc: o?.desc ?? i.desc,
          hidden: o?.hidden === true,
          edited: Boolean(o),
        };
      }),
    })),
  });
  return {
    menus: [
      build("food", "Main menu", FOOD_MENU),
      build("brunch", "Sunday brunch", BRUNCH_MENU),
      build("reserve", "The Copper Reserve", RESERVE_MENU),
    ],
    additions,
    order,
    backend: getStore().backend,
  };
}
