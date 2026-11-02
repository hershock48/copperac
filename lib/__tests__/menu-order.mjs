// Regression test for the menu row order, run with `node lib/__tests__/menu-order.mjs`.
//
// It imports the REAL orderIds from lib/workroom/menu-def.ts (Node strips the types itself,
// 22.18+). Abbie, 2 Nov 2026: new brunch items landed at the bottom of Brunch Entrees and the
// only way to put one at the top was to delete everything above it. The saved order is a list
// of row ids; these cases pin how it lays a section out.
import { orderIds, sectionKey } from "../workroom/menu-def.ts";

let failed = 0;
const check = (name, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${pass ? "" : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const builtIn = ["p1", "p2", "p3", "add_a"];
check("no saved order is the built-in order", orderIds(builtIn, undefined), builtIn);
check("an empty saved order is the built-in order", orderIds(builtIn, []), builtIn);
check("the saved order wins", orderIds(builtIn, ["add_a", "p1", "p2", "p3"]), ["add_a", "p1", "p2", "p3"]);
check("a row the order does not name joins the end", orderIds([...builtIn, "add_b"], ["add_a", "p1", "p2", "p3"]), ["add_a", "p1", "p2", "p3", "add_b"]);
check("an id for a removed row is skipped", orderIds(["p1", "p2"], ["gone", "p2", "p1"]), ["p2", "p1"]);
check("a repeated id is laid out once", orderIds(["p1", "p2"], ["p2", "p2", "p1"]), ["p2", "p1"]);
check("a partial order puts the named rows first", orderIds(builtIn, ["p3"]), ["p3", "p1", "p2", "add_a"]);
check("section keys carry the menu", sectionKey("brunch", "Brunch Entrees"), "brunch|Brunch Entrees");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall 8 passed");
