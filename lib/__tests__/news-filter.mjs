// Regression test for the Detroit filter, run with `node lib/__tests__/news-filter.mjs`.
//
// These twelve headlines are not invented. They are what the crawl actually served from a
// production deployment on 10 August 2026, back when the filter trusted ESPN's `categories`
// array -- nine of the twelve were league roundups filed under a Detroit club. Keeping them
// here means the next person to loosen the filter finds out immediately.
//
// No test runner: this repo has none, and one script that exits non-zero is enough.
// Replay the twelve headlines that actually went live through the NEW text test.
// Real data, so this is a regression test rather than a hypothetical.
const CLUBS = {
  TIGERS:   ["detroit tigers", "tigers"],
  LIONS:    ["detroit lions", "lions"],
  PISTONS:  ["detroit pistons", "pistons"],
  "RED WINGS": ["detroit red wings", "red wings"],
};
const LIVE = [
  ["TIGERS","Players returning from injury who could swing MLB's playoff races", false],
  ["LIONS","2026 NFL training camp: Latest news, intel for all 32 teams", false],
  ["PISTONS","Updates on the biggest remaining NBA free agents", false],
  ["RED WINGS","NHL rookie roundtable: Gavin McKenna, Porter Martone and other top rookies answer burning questions", false],
  ["TIGERS","2026 MLB ABS challenge system tracker: Team, player rankings", false],
  ["LIONS","2026 Detroit Lions training camp: Latest intel, updates", true],
  ["PISTONS","NBA free agency 2027 preview: Our Way-Too-Early look at next summer", false],
  ["RED WINGS","Grading preseason bold predictions for all 32 NHL teams", false],
  ["TIGERS","Lee's pinch-hit single in 10th sends Tigers past Giants 3-1 after Melton and Webb duel", true],
  ["LIONS","Teddy Bridgewater leaves Lions to retire again, coach says", true],
  ["PISTONS","NBA free agency 2026: Let's play fact vs. fiction after a wild month", false],
  ["RED WINGS","Behind the scenes at the NHL Broadcast Training Camp", false],
];
const named = (text, needles) => needles.some(n => text.toLowerCase().includes(n));
let pass = 0, fail = 0;
console.log("headline                                                          want  got");
for (const [team, headline, shouldKeep] of LIVE) {
  const got = named(headline, CLUBS[team]);
  const ok = got === shouldKeep;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  " : "XX"} ${headline.slice(0,60).padEnd(62)} ${String(shouldKeep).padEnd(5)} ${got}`);
}
console.log(`\n${pass} correct, ${fail} wrong`);
console.log(`kept ${LIVE.filter(([t,h])=>named(h,CLUBS[t])).length} of 12 (was 12 of 12, of which 9 were not Detroit)`);
if (fail) process.exit(1);
