// Guest page reads may use a ten-second process cache. Order submission uses
// fresh: true and compares the resulting quote with the amounts the guest saw.
// Copper's parked demo source is its stored ordering document; public customers use Toast.

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

export async function loadMenuDoc(store: OrderStore, options: { fresh?: boolean } = {}): Promise<MenuDocSection[]> {
  const bag = cacheBag();
  if (!options.fresh && bag.cache && Date.now() - bag.cache.at < CACHE_MS) return bag.cache.doc;
  const fromDb = await store.getMenuDoc();
  const doc = (fromDb ?? (SEED_MENU as MenuDocSection[])) as MenuDocSection[];
  const error = doc.length === 0 ? null : validateMenuDoc(doc);
  if (error) throw new Error("The ordering menu is invalid: " + error);
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
export async function guestMenu(store: OrderStore, options: { fresh?: boolean } = {}): Promise<{ sections: OrderableSection[]; index: Map<string, OrderableItem> }> {
  const doc = await loadMenuDoc(store, options);
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
