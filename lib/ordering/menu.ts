// The orderable menu: database-backed and staff-editable.
//
// History, because it explains the shape: v1 derived the menu from the site's
// lib/menu.ts; v2 replaced that with a harvest of Copper's live Toast menu
// (114 items, real modifier groups, their own photos -- see toast-menu.json
// and the harvest story in git). v3, this file, moves the menu into the
// DATABASE so the restaurant edits it themselves on the kitchen board, the
// way they edit menus in Toast's back office. The harvested JSON is now the
// SEED: first read on an empty database loads it, and every edit after that
// belongs to the restaurant. Menu drift stops being our problem to sync away
// and becomes their button to press.
//
// Two kinds of "off the menu", deliberately distinct:
//   86'd    (kitchen state)  sold out tonight, shows greyed on the order page
//   hidden  (menu editor)    off the menu entirely, invisible to guests
//
// Reads are cached in-process for a few seconds: order validation and page
// renders hit this constantly, edits happen a few times a week, and a lambda
// serving a 10-second-old price is fine because the server re-prices every
// order at submit time anyway.

import SEED_MENU from "./toast-menu.json";
import type { OrderStore } from "./store";

export type OrderOption = {
  name: string;
  required: boolean;
  multi?: boolean;
  choices: { name: string; priceCents: number }[];
};

// The stored document shape (what the editor edits and the DB holds).
export type MenuDocItem = {
  id: string;
  name: string;
  desc: string;
  priceCents: number;
  image: string | null;
  hidden?: boolean;
  groups: { name: string; required: boolean; multi: boolean; choices: { name: string; priceCents: number }[] }[];
};
export type MenuDocSection = { name: string; ageRestricted: boolean; items: MenuDocItem[] };

// The runtime shape pages and validation consume (hidden items filtered out
// for guests; kept in for the editor and the 86 board).
export type OrderableItem = {
  id: string;
  section: string;
  name: string;
  desc: string;
  priceCents: number;
  options: OrderOption[];
  ageRestricted: boolean;
  image?: string;
};
export type OrderableSection = { name: string; items: OrderableItem[]; ageRestricted: boolean };

const CACHE_MS = 10_000;
type Cache = { doc: MenuDocSection[]; at: number };

function cacheBag(): { cache: Cache | null } {
  const g = globalThis as unknown as { __copperMenuCache?: { cache: Cache | null } };
  g.__copperMenuCache ??= { cache: null };
  return g.__copperMenuCache;
}

export function invalidateMenuCache(): void {
  cacheBag().cache = null;
}

export async function loadMenuDoc(store: OrderStore): Promise<MenuDocSection[]> {
  const bag = cacheBag();
  if (bag.cache && Date.now() - bag.cache.at < CACHE_MS) return bag.cache.doc;
  const fromDb = await store.getMenuDoc();
  const doc = (fromDb ?? (SEED_MENU as MenuDocSection[])) as MenuDocSection[];
  bag.cache = { doc, at: Date.now() };
  return doc;
}

export function toOrderable(doc: MenuDocSection[], opts: { includeHidden: boolean }): OrderableSection[] {
  return doc
    .map((s) => ({
      name: s.name,
      ageRestricted: s.ageRestricted,
      items: s.items
        .filter((i) => opts.includeHidden || !i.hidden)
        .map((i) => ({
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
    }))
    .filter((s) => s.items.length > 0 || opts.includeHidden);
}

export function buildIndex(sections: OrderableSection[]): Map<string, OrderableItem> {
  return new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i]));
}

// Guest-facing menu + index, one call: what the order page renders and what
// the order API validates against. Hidden items are simply not in it, so a
// stale cart line referencing one fails the ordinary unknown-item check.
export async function guestMenu(store: OrderStore): Promise<{ sections: OrderableSection[]; index: Map<string, OrderableItem> }> {
  const doc = await loadMenuDoc(store);
  const sections = toOrderable(doc, { includeHidden: false });
  return { sections, index: buildIndex(sections) };
}

// Validation for the editor's PUT: shape, uniqueness, sane numbers. Returns
// an error sentence or null. Deliberately permissive about content -- it is
// their menu -- and strict about anything that would corrupt orders.
export function validateMenuDoc(doc: unknown): string | null {
  if (!Array.isArray(doc) || doc.length === 0) return "The menu cannot be empty.";
  const ids = new Set<string>();
  for (const s of doc as MenuDocSection[]) {
    if (typeof s?.name !== "string" || !s.name.trim()) return "Every section needs a name.";
    if (typeof s.ageRestricted !== "boolean") return "Malformed section.";
    if (!Array.isArray(s.items)) return "Malformed section.";
    for (const i of s.items) {
      if (typeof i?.id !== "string" || !i.id) return "Malformed item id.";
      if (ids.has(i.id)) return `Duplicate item id: ${i.id}`;
      ids.add(i.id);
      if (typeof i.name !== "string" || !i.name.trim()) return "Every item needs a name.";
      if (!Number.isInteger(i.priceCents) || i.priceCents < 0 || i.priceCents > 1_000_00)
        return `Price out of range on ${i.name}.`;
      if (typeof i.desc !== "string") return "Malformed description.";
      if (i.image !== null && typeof i.image !== "string") return "Malformed photo URL.";
      if (!Array.isArray(i.groups)) return "Malformed options.";
      for (const g of i.groups) {
        if (typeof g?.name !== "string" || !g.name.trim()) return `An option group on ${i.name} needs a name.`;
        if (typeof g.required !== "boolean" || typeof g.multi !== "boolean") return "Malformed option group.";
        if (!Array.isArray(g.choices) || g.choices.length === 0)
          return `Option group "${g.name}" on ${i.name} needs at least one choice.`;
        for (const c of g.choices) {
          if (typeof c?.name !== "string" || !c.name.trim()) return `A choice in "${g.name}" needs a name.`;
          if (!Number.isInteger(c.priceCents) || c.priceCents < 0 || c.priceCents > 1_000_00)
            return `Choice price out of range in "${g.name}".`;
        }
      }
    }
  }
  return null;
}
