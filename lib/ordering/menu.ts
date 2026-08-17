// The orderable menu, derived from FOOD_MENU rather than retyped.
//
// lib/menu.ts stays the single source of truth for names, descriptions and
// prices (glaze.md: facts live in one place). This file only adds what online
// ordering needs on top: stable ids, choice groups and priced add-ons that the
// menu states in prose ("your choice of sauce", "Add grilled chicken + $5"),
// and the list of sections that do not sell online.
//
// Because the orderable menu is derived, a new item added to FOOD_MENU becomes
// orderable automatically, and an item renamed there without updating the
// overlay below fails loudly at build time (see the assertion at the bottom)
// rather than silently dropping its options.

import { FOOD_MENU } from "@/lib/menu";

export type OrderOption = {
  name: string; // e.g. "Sauce"
  required: boolean;
  // Toast-style modifier groups come in two shapes: pick exactly one (sauce,
  // protein, side) and pick any number (toppings, add-ons). multi covers the
  // second. Their Toast page has real modifier groups loaded per item (Kevin,
  // Aug 2026); this overlay currently carries only what the printed menu
  // states, and grows to match Toast item by item as the bar's real modifier
  // lists come over from the back office.
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
  // Path under /public, e.g. "/img/menu/copper-burger.webp". Absent means the
  // card renders text-only, which is deliberate: no gray placeholder boxes.
  image?: string;
};

export type OrderableSection = { name: string; items: OrderableItem[]; ageRestricted: boolean };

// Cocktails sell online on purpose: the bar's Toast page already sells a full
// Online Drinks section, Michigan made cocktails-to-go permanent in 2023, and
// the brief is parity with Toast. What we add that Toast's page does not show
// is the guardrail: an alcohol order requires a 21+ acknowledgment at checkout
// and the kitchen ticket carries an ID CHECK flag. Sealed-container rules at
// handoff are the bar's side of the counter, exactly as they are with Toast.
const AGE_RESTRICTED_SECTIONS = new Set(["Cocktails"]);
const EXCLUDED_SECTIONS = new Set<string>([]);

const WING_SAUCES = ["BBQ", "Garlic Parm", "Honey Sriracha", "Maple Chili", "Mango Habanero"];
const TENDER_SAUCES = ["Ranch", "Honey Mustard", "BBQ"];
const TACO_PROTEINS = ["Beef", "Chicken", "Pork"];

// Options overlay, keyed by exact FOOD_MENU item name. Only items whose menu
// text states a choice or a priced add-on appear here; everything else orders
// as printed.
const OPTIONS: Record<string, OrderOption[]> = {
  Wings: [
    { name: "Sauce", required: true, choices: WING_SAUCES.map((s) => ({ name: s, priceCents: 0 })) },
  ],
  "Chicken Tenders": [
    { name: "Dipping sauce", required: true, choices: TENDER_SAUCES.map((s) => ({ name: s, priceCents: 0 })) },
  ],
  Tacos: [
    { name: "Protein", required: true, choices: TACO_PROTEINS.map((p) => ({ name: p, priceCents: 0 })) },
  ],
  "Taco Salad": [
    { name: "Protein", required: true, choices: TACO_PROTEINS.map((p) => ({ name: p, priceCents: 0 })) },
  ],
  "Greek Salad": [
    { name: "Add grilled chicken", required: false, choices: [{ name: "Grilled chicken", priceCents: 500 }] },
  ],
  "Caesar Salad": [
    { name: "Add grilled chicken", required: false, choices: [{ name: "Grilled chicken", priceCents: 500 }] },
  ],
  "Corn Dog": [
    { name: "Add a second corn dog", required: false, choices: [{ name: "Second corn dog", priceCents: 300 }] },
  ],
  "Housemade Tortilla chips and salsa": [
    { name: "Extra salsa", required: false, choices: [{ name: "Extra salsa", priceCents: 200 }] },
  ],
  "Housemade Tortilla chips and guacamole": [
    { name: "Extra guacamole", required: false, choices: [{ name: "Extra guacamole", priceCents: 400 }] },
  ],
  "Housemade Tortilla chips and queso": [
    { name: "Extra queso", required: false, choices: [{ name: "Extra queso", priceCents: 400 }] },
  ],
};

// Item photos, keyed by exact FOOD_MENU item name. Their Toast page has a
// photo on every item (Kevin, standing in front of it, Aug 2026 — an earlier
// markup-only fetch of that page missed them because Toast renders the menu
// client side). Parity means every entry here eventually gets a real photo of
// the real dish: the bar's own uploads from the Toast back office, or fresh
// shots. NO stock photos, ever — the wings in the picture must be the wings
// in the bag. Files go in public/img/menu/, webp, roughly square.
const PHOTOS: Record<string, string> = {
  // PLACEHOLDER: empty until the bar's item photos come over from Toast.
  // The one burger shot in /img is the page hero, not verifiably the Copper
  // Burger as plated, so it does not get promoted to an item card.
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toCents(price: string): number {
  return Math.round(parseFloat(price) * 100);
}

// "Caesar Salad" exists in two sections (Salads, Sides) at different prices,
// which is why ids carry the section: sides-caesar-salad is not the $9 salad.
export const ORDERABLE_MENU: OrderableSection[] = FOOD_MENU.filter(
  (s) => !EXCLUDED_SECTIONS.has(s.name)
).map((s) => ({
  name: s.name,
  ageRestricted: AGE_RESTRICTED_SECTIONS.has(s.name),
  items: s.items.map((i) => ({
    id: `${slug(s.name)}-${slug(i.name)}`,
    section: s.name,
    name: i.name,
    desc: i.desc,
    priceCents: toCents(i.price),
    // Options attach in the item's home section only. The Sides "Caesar
    // Salad" is a side, and adding $5 chicken to a $4 side is not on the menu.
    options:
      s.name === "Sides" ? [] : (OPTIONS[i.name] ?? []),
    ageRestricted: AGE_RESTRICTED_SECTIONS.has(s.name),
    image: PHOTOS[i.name],
  })),
}));

export const ITEM_INDEX: Map<string, OrderableItem> = new Map(
  ORDERABLE_MENU.flatMap((s) => s.items).map((i) => [i.id, i])
);

// Fail the build, not the guest: every OPTIONS key must still name a real
// FOOD_MENU item, or a menu rename has silently orphaned its choices.
const allNames = new Set(FOOD_MENU.flatMap((s) => s.items.map((i) => i.name)));
for (const key of Object.keys(OPTIONS)) {
  if (!allNames.has(key)) {
    throw new Error(
      `lib/ordering/menu.ts: OPTIONS names "${key}" but lib/menu.ts has no such item. ` +
        `The menu was edited without updating the ordering overlay.`
    );
  }
}
