// Guest page reads may use a ten-second process cache. Order submission uses
// fresh: true and compares the resulting quote with the amounts the guest saw.
// Copper's parked demo source is its stored ordering document; public customers use Toast.

import SEED_MENU from "./toast-menu.json";
import type { OrderStore } from "./store";

export type { OrderOption, OrderableItem, OrderableSection } from "./menu-document-fields";
import type { OrderableItem, OrderableSection } from "./menu-document-fields";
import { toOrderable } from "./menu-document-fields";
export { toOrderable } from "./menu-document-fields";

// The stored document shape (what the editor edits and the DB holds).
export type { MenuDocItem, MenuDocSection } from "./menu-document-fields";
import type { MenuDocSection } from "./menu-document-fields";
import { validateMenuDoc } from "./menu-document-fields";
export { validateMenuDoc } from "./menu-document-fields";
export const seedMenuDoc = (): MenuDocSection[] => structuredClone(SEED_MENU);

// The runtime shape pages and validation consume (hidden items filtered out
// for guests; kept in for the editor and the 86 board).
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

