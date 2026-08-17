// The orderable menu: Copper's LIVE Toast menu, harvested item by item.
//
// This file used to derive from lib/menu.ts, the printed site menu. That
// changed the day we compared it against what their Toast channel actually
// sells: Toast has items the site menu has never heard of (Quesadilla, Double
// Smash Burger, Spicy Peach Wings, a pie), different prices in places (Nachos
// $12 on Toast, $16 on the site), fuller descriptions ("Served w/ a side
// choice"), a photo on nearly every food item, and real modifier groups per
// item -- side choices, egg styles, thirty-line topping lists. Kevin's brief
// is parity with Toast, so the ordering menu's source of truth is Toast's own
// data, not the marketing menu.
//
// HOW THE DATA GOT HERE, because it will need re-harvesting after menu
// changes: order.toasttab.com renders its menu client side, so fetching the
// page yields no items -- but every item has a server-rendered share page at
// /item-<slug>_<guid> whose og:image is the item's photo and whose body lists
// the modifier groups. toast-menu.json is those ~114 pages, fetched and
// transcribed verbatim (Aug 2026). The item pages were enumerated from the
// menu page's own hyperlinks.
//
// PHOTOS ARE HOT-LINKED to Toast's public CDN -- the bar's own uploads,
// referenced in place rather than copied. Zero migration effort now, one real
// obligation later: mirror the files into public/img/menu/ before the bar
// ends its Toast contract, or the pictures die with the account. It is on the
// README's before-launch list.
//
// lib/menu.ts still feeds the /menu display page and is deliberately
// untouched; reconciling the two menus is a client conversation, not a code
// decision.

import TOAST_MENU from "./toast-menu.json";

export type OrderOption = {
  name: string;
  required: boolean;
  // Pick-any group (toppings, add-ons) vs pick-one (side, dressing). A
  // required non-multi group renders as radios and demands exactly one; a
  // required multi group demands at least one.
  multi?: boolean;
  choices: { name: string; priceCents: number }[];
};

export type OrderableItem = {
  id: string;
  section: string;
  name: string;
  desc: string;
  priceCents: number;
  options: OrderOption[];
  ageRestricted: boolean;
  // Absent means the card renders text-only, on purpose: no placeholder
  // boxes. 50 of 114 items carry a real photo today; the rest show none
  // until the bar uploads one (to Toast, until we migrate; then to us).
  image?: string;
};

export type OrderableSection = { name: string; items: OrderableItem[]; ageRestricted: boolean };

type RawChoice = { name: string; priceCents: number };
type RawGroup = { name: string; required: boolean; multi: boolean; choices: RawChoice[] };
type RawItem = {
  id: string;
  name: string;
  desc: string;
  priceCents: number;
  image: string | null;
  groups: RawGroup[];
};
type RawSection = { name: string; ageRestricted: boolean; items: RawItem[] };

export const ORDERABLE_MENU: OrderableSection[] = (TOAST_MENU as RawSection[]).map((s) => ({
  name: s.name,
  ageRestricted: s.ageRestricted,
  items: s.items.map((i) => ({
    id: i.id,
    section: s.name,
    name: i.name,
    desc: i.desc,
    priceCents: i.priceCents,
    options: i.groups.map((g) => ({
      name: g.name,
      required: g.required,
      multi: g.multi,
      choices: g.choices,
    })),
    ageRestricted: s.ageRestricted,
    image: i.image ?? undefined,
  })),
}));

export const ITEM_INDEX: Map<string, OrderableItem> = new Map(
  ORDERABLE_MENU.flatMap((s) => s.items).map((i) => [i.id, i])
);

// Fail the build, not the guest: ids are the 86 board's and the cart's keys,
// so a duplicate would let one tap 86 two different dishes.
const total = ORDERABLE_MENU.reduce((n, s) => n + s.items.length, 0);
if (ITEM_INDEX.size !== total) {
  throw new Error("lib/ordering/menu.ts: duplicate item ids in toast-menu.json");
}
