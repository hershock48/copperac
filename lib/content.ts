import "server-only";

import { BRUNCH_MENU, COCKTAILS, FOOD_MENU, type MenuSection } from "@/lib/menu";
import { EVENTS, type CACEvent } from "@/lib/site";
import { getStore } from "@/lib/workroom/store";
import type { EventsContact, WorkroomEvent } from "@/lib/workroom/events-def";
import { menuItemKey, type MenuId, type MenuOverrides } from "@/lib/workroom/menu-def";

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
    checked-in seed, seed rows yielding to a workroom row of the same slug. */
async function allSiteEvents(): Promise<CACEvent[]> {
  const stored = await getStore().events.list();
  const fromWorkroom = stored.filter((e) => e.published).map(toSiteEvent);
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
  for (const [menu, sections] of [["food", FOOD_MENU], ["brunch", BRUNCH_MENU]] as const) {
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

function applyOverrides(menu: MenuId, sections: MenuSection[], overrides: MenuOverrides): MenuSection[] {
  return sections
    .map((s) => ({
      ...s,
      items: s.items
        .map((i) => {
          const o = overrides[menuItemKey(menu, s.name, i.name)];
          if (!o) return i;
          if (o.hidden) return null;
          return { ...i, price: o.price ?? i.price, desc: o.desc ?? i.desc };
        })
        .filter((i): i is MenuSection["items"][number] => i !== null),
    }))
    .filter((s) => s.items.length > 0);
}

/**
 * The menus as the site renders them. The cocktails section keeps its
 * checked-in name so the menu page can still swap it for the live Scooplist
 * list (it matches by name, since these are new objects).
 */
export async function getMenus(): Promise<{ food: MenuSection[]; brunch: MenuSection[]; cocktailsName: string }> {
  const overrides = await getMenuOverrides();
  return {
    food: applyOverrides("food", FOOD_MENU, overrides),
    brunch: applyOverrides("brunch", BRUNCH_MENU, overrides),
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
  menus: { id: MenuId; label: string; sections: { name: string; items: MenuEditorItem[] }[] }[];
  backend: "postgres" | "memory";
};

export async function menuEditorState(): Promise<MenuEditorState> {
  const overrides = await getMenuOverrides();
  const build = (id: MenuId, label: string, sections: MenuSection[]) => ({
    id,
    label,
    sections: sections.map((s) => ({
      name: s.name,
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
    menus: [build("food", "Main menu", FOOD_MENU), build("brunch", "Sunday brunch", BRUNCH_MENU)],
    backend: getStore().backend,
  };
}
