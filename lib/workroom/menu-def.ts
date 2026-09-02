/**
 * What the menu editor may change about an item, and how an edit is keyed.
 *
 * CLIENT-SAFE ON PURPOSE (no server-only, no store): the editor renders and
 * checks from here, the save route checks against it again, lib/content.ts
 * lays the edits over lib/menu.ts by these keys.
 *
 * The whitelist is deliberately narrow. A price, a description, and whether
 * the item is on the site at all. Not the name, not the section, not a new
 * item: those change the shape of the menu, and the printed menu is still
 * the truth for shape. When the print changes, lib/menu.ts changes with it,
 * and an edit whose item no longer exists is dropped on read.
 */

export type MenuId = "food" | "brunch";

export type MenuOverride = {
  /** "12.00" style, or absent to keep the built-in price */
  price?: string;
  desc?: string;
  /** Off the site (sold out for the season, dropped from the print) */
  hidden?: boolean;
};

/** Keyed by menuItemKey(); only edited items, only whitelisted fields. */
export type MenuOverrides = Record<string, MenuOverride>;

export function menuItemKey(menu: MenuId, section: string, item: string): string {
  return `${menu}|${section}|${item}`;
}

/** "" means keep the built-in. Otherwise dollars with up to two decimals. */
export function priceError(value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) return "Just the number, like 12 or 12.50.";
  return null;
}

/** Normalize what she typed to the "12.00" shape lib/menu.ts uses. */
export function normalizePrice(value: string): string {
  const v = value.trim();
  if (v === "") return "";
  return Number(v).toFixed(2);
}
