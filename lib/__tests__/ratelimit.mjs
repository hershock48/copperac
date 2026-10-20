// Regression test for the workroom door's counter, run with `node lib/__tests__/ratelimit.mjs`.
//
// It imports the REAL limiter from lib/workroom/ratelimit.ts (Node strips the types itself,
// 22.18+). The first case is the one a prune rewrite broke on 20 Oct 2026: an empty bucket was
// dropped from the map and the miss pushed into the detached copy, so six wrong passcodes in a
// row all came back 401 and the sixth was never refused.
import { limiter } from "../workroom/ratelimit.ts";

let failed = 0;
const check = (name, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${pass ? "" : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const door = limiter(`test-${Date.now()}`, { windowMs: 60_000, max: 5 });
const seq = [];
for (let i = 0; i < 6; i++) {
  seq.push(door.allowed("a"));
  if (seq[i]) door.fail("a");
}
check("five misses allowed, the sixth refused", seq, [true, true, true, true, true, false]);
check("retry-after is within the window", door.retryAfterSec("a") >= 1 && door.retryAfterSec("a") <= 60, true);
check("another address is unaffected", door.allowed("b"), true);
check("a clean address has no wait", door.retryAfterSec("b"), 0);
door.clear("a");
check("clear reopens the door", door.allowed("a"), true);

const quick = limiter(`test-quick-${Date.now()}`, { windowMs: 30, max: 1 });
quick.fail("c");
check("a miss inside the window counts", quick.allowed("c"), false);
await new Promise((r) => setTimeout(r, 40));
check("a miss past the window is forgotten", quick.allowed("c"), true);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall 7 passed");
