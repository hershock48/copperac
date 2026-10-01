// Regression test for the headline filter, run with `node lib/__tests__/news-filter.mjs`.
//
// It imports the REAL club table and the REAL matcher from lib/news-match.ts (Node strips the
// types itself, 22.18+), so a change to a needle or to names() shows up here. The first version
// of this file carried its own copy of both, which is a promise nothing enforces.
//
// The twelve Detroit headlines are not invented. They are what the crawl actually served from a
// production deployment on 10 August 2026, back when the filter trusted ESPN's `categories`
// array -- nine of the twelve were league roundups filed under a Detroit club. Keeping them
// here means the next person to loosen the filter finds out immediately.
//
// No test runner: this repo has none, and one script that exits non-zero is enough.
import { CLUBS, names } from "../news-match.ts";

const club = (team) => CLUBS.find((c) => c.team === team);
const named = (headline, team) => names(headline.toLowerCase(), club(team));

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

// The schools, 1 Oct 2026. Michigan's needle was "wolverines" only, and ESPN's college copy says
// "Michigan" far more often than "Wolverines", so most Michigan stories fell through and the
// school was nearly absent from the crawl. A bare "michigan" now counts unless the text names
// another Michigan school (MICHIGAN_BARE in lib/news-match.ts). These are the shapes that
// matter, written rather than captured.
const SCHOOLS = [
  ["MICHIGAN", "No. 20 Michigan holds off Nebraska behind Underwood's three touchdowns", true],
  ["MICHIGAN", "Wolverines land five-star QB for 2027 class", true],
  ["MICHIGAN", "Michigan State stuns Michigan in East Lansing", false],
  ["MICH STATE", "Michigan State stuns Michigan in East Lansing", true],
  ["MICHIGAN", "Central Michigan upsets Toledo on last-second field goal", false],
  ["MICHIGAN", "Big Ten power rankings: Every team after Week 5", false],
  ["MICH STATE", "Spartans' Chiles throws for 400 yards in win over Iowa", true],
  ["MICH STATE", "Big Ten power rankings: Every team after Week 5", false],
];

let pass = 0;
let fail = 0;
function run(title, cases) {
  console.log(`\n${title.padEnd(66)} want  got`);
  for (const [team, headline, shouldKeep] of cases) {
    const got = named(headline, team);
    const ok = got === shouldKeep;
    if (ok) pass += 1;
    else fail += 1;
    console.log(`${ok ? "  " : "XX"} ${team.padEnd(11)}${headline.slice(0, 49).padEnd(51)} ${String(shouldKeep).padEnd(5)} ${got}`);
  }
}

run("Detroit, the twelve that went live on 10 Aug 2026", LIVE);
console.log(`kept ${LIVE.filter(([t, h]) => named(h, t)).length} of 12 (was 12 of 12, of which 9 were not Detroit)`);
run("The schools", SCHOOLS);

console.log(`\n${pass} correct, ${fail} wrong`);
if (fail) process.exit(1);
