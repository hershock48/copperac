// Option pricing against the real Toast harvest. `node lib/__tests__/ordering-pricing.mjs`
// (Node 24 strips the types from the .ts import; nothing else is needed).
//
// Every case here is a name Toast reuses across two groups on one item, which is
// exactly what a 15-agent audit (21 Aug 2026) caught the first version getting
// wrong: it matched picks by bare name across every group, so one queso was
// billed twice and picks could be refused as "Malformed options." because the
// same names also lived in a single-pick group. If the harvest is redone and
// these items change, pick new colliding items rather than deleting the cases.

import { createRequire } from "node:module";
import { parsePicks, priceOptions } from "../ordering/pricing.ts";

const require = createRequire(import.meta.url);
const SEED = require("../ordering/toast-menu.json");

const item = (name) => {
  for (const s of SEED) for (const it of s.items) if (it.name === name) return { ...it, options: it.groups };
  throw new Error(`seed menu has no item named ${name}`);
};
const nachos = item("Nachos");
const wings = item("Spicy Peach Wings");
const burger = item("Single Loose Burger");

// The required single picks each item cannot be ordered without.
const meat = { group: "Meat choice", choice: "Beef" };
const tossed = { group: "Spicy Peach Wing Modifiers", choice: "Tossed in Spicy Peach" };

let failed = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};

// Nachos: "5 oz. Queso" is $4 in Nachos Options and $4 again in Additional
// Sauces. One pick is one queso. Labels follow the menu's group order and
// carry the group name only where the choice name is ambiguous.
check(
  "one queso is charged once",
  priceOptions(nachos, [{ group: "Nachos Options", choice: "5 oz. Queso" }, meat]),
  { ok: true, optionCents: 400, labels: ["Nachos Options: 5 oz. Queso", "Beef"] }
);
check(
  "queso in both groups is two quesos, labeled apart for the kitchen",
  priceOptions(nachos, [
    { group: "Nachos Options", choice: "5 oz. Queso" },
    meat,
    { group: "Additional Sauces", choice: "5 oz. Queso" },
  ]),
  {
    ok: true,
    optionCents: 800,
    labels: ["Nachos Options: 5 oz. Queso", "Beef", "Additional Sauces: 5 oz. Queso"],
  }
);

// Wings: "2 oz. Ranch" is included (free, single pick) and also an extra
// sauce at 50 cents. Picking the included one costs nothing, and picking
// both is a legal order for exactly 50 cents.
check(
  "the included ranch is free, not also billed as an extra",
  priceOptions(wings, [{ group: "Ranch or Bleu Included", choice: "2 oz. Ranch" }, tossed]),
  { ok: true, optionCents: 0, labels: ["Ranch or Bleu Included: 2 oz. Ranch", "Tossed in Spicy Peach"] }
);
check(
  "included ranch plus an extra ranch is one extra",
  priceOptions(wings, [
    { group: "Ranch or Bleu Included", choice: "2 oz. Ranch" },
    tossed,
    { group: "Additional Sauces", choice: "2 oz. Ranch" },
  ]),
  {
    ok: true,
    optionCents: 50,
    labels: ["Ranch or Bleu Included: 2 oz. Ranch", "Tossed in Spicy Peach", "Additional Sauces: 2 oz. Ranch"],
  }
);

// Burger: "Add Pickles" is 50 cents under Copper Coneys Options and free
// under Plain Burger Options. The group decides the price.
check(
  "free pickles stay free",
  priceOptions(burger, [{ group: "Plain Burger Options", choice: "Add Pickles" }]),
  { ok: true, optionCents: 0, labels: ["Plain Burger Options: Add Pickles"] }
);
check(
  "coney pickles cost the coney price",
  priceOptions(burger, [{ group: "Copper Coneys Options", choice: "Add Pickles" }]),
  { ok: true, optionCents: 50, labels: ["Copper Coneys Options: Add Pickles"] }
);
check(
  "a unique name needs no group on the ticket",
  priceOptions(burger, [{ group: "Plain Burger Options", choice: "Add Bacon" }]),
  { ok: true, optionCents: 200, labels: ["Add Bacon"] }
);

// Required groups still gate the order, and say which one in the bar's voice.
check("a required single pick left empty names the group", priceOptions(nachos, []), {
  ok: false,
  error: "Nachos needs a meat choice picked.",
});

// Guest input is guest input.
const malformed = { ok: false, error: "Malformed options." };
check("unknown group is malformed", priceOptions(nachos, [meat, { group: "Nope", choice: "5 oz. Queso" }]), malformed);
check(
  "unknown choice is malformed",
  priceOptions(nachos, [meat, { group: "Nachos Options", choice: "Gold Leaf" }]),
  malformed
);
check(
  "the same pick twice is malformed, not double-billed",
  priceOptions(nachos, [
    meat,
    { group: "Nachos Options", choice: "5 oz. Queso" },
    { group: "Nachos Options", choice: "5 oz. Queso" },
  ]),
  malformed
);
check(
  "two picks in a single-pick optional group is malformed",
  priceOptions(wings, [
    tossed,
    { group: "Ranch or Bleu Included", choice: "2 oz. Ranch" },
    { group: "Ranch or Bleu Included", choice: "2 oz. Bleu Cheese" },
  ]),
  malformed
);
check(
  "two picks in a required single group is malformed",
  priceOptions(nachos, [meat, { group: "Meat choice", choice: "Chicken" }]),
  { ok: false, error: "Nachos needs a meat choice picked." }
);

// The wire parser.
check("missing options means no picks", parsePicks(undefined), []);
check("a bare name list is a stale page, not an attack", parsePicks(["5 oz. Queso"]), "stale");
check("a non-list is malformed", parsePicks({ group: "x", choice: "y" }), null);
check("a pick missing its group is malformed", parsePicks([{ choice: "y" }]), null);
check("well-formed picks pass through", parsePicks([{ group: "x", choice: "y", extra: 1 }]), [{ group: "x", choice: "y" }]);

if (failed) {
  console.log(`\n${failed} failing`);
  process.exit(1);
}
console.log("\nall passing");
