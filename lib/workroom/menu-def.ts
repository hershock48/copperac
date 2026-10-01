/**
 * What the menu editor may change about an item, and how an edit is keyed.
 *
 * CLIENT-SAFE ON PURPOSE (no server-only, no store): the editor renders and
 * checks from here, the save route checks against it again, lib/content.ts
 * lays the edits over lib/menu.ts by these keys.
 *
 * Two kinds of edit, stored apart because they are different things:
 *
 *   MenuOverride   a change to a PRINTED item: its price, its description,
 *                  or whether it is on the site at all. Never its name or
 *                  section. Keyed by menu, section and name, so when the
 *                  print changes and lib/menu.ts changes with it, an edit
 *                  whose item no longer exists is dropped on read.
 *
 *   MenuAddition   an item the club added that the print does not have, in
 *                  a printed section or a new one. Meeting note, 1 Oct 2026:
 *                  the brunch menu changes every month, and until this the
 *                  workroom could only reprice or switch off what was
 *                  already there, so a new brunch bake meant a code change.
 *                  Now it is a row on the Menu screen. Additions carry their
 *                  own values rather than overriding a base, and removing
 *                  one deletes it: there is no print to fall back to.
 *
 * Deleting every edit of both kinds still puts the site back exactly as
 * built, which is what keeps "you cannot break the site from this screen"
 * true.
 */

export type MenuId = "food" | "brunch";
export const MENU_IDS: readonly MenuId[] = ["food", "brunch"];

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

/** An item the club added from the workroom. See the note at the top. */
export type MenuAddition = {
  /** add_… once saved. The editor hands a new row a tmp_… id and the save route replaces it. */
  id: string;
  menu: MenuId;
  /** A printed section's exact name to join it, or a new name to start a section */
  section: string;
  name: string;
  desc: string;
  /** "12.00" style, or "" for no price (a market-price special) */
  price: string;
};

export type AdditionErrors = Partial<Record<"section" | "name" | "desc" | "price", string>>;

export function additionErrors(a: MenuAddition): AdditionErrors {
  const errors: AdditionErrors = {};
  const section = a.section.trim();
  const name = a.name.trim();
  if (!section) errors.section = "Which section does it go in?";
  else if (section.length > 60) errors.section = "Keep the section name under 60 characters.";
  if (!name) errors.name = "Give it a name.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  if (a.desc.length > 400) errors.desc = "Keep the description under 400 characters.";
  const price = priceError(a.price.replace(/^\$/, ""));
  if (price) errors.price = price;
  return errors;
}

/** The first thing wrong with an addition, as one line for its row, or null. */
export function additionError(a: MenuAddition): string | null {
  return Object.values(additionErrors(a))[0] ?? null;
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
