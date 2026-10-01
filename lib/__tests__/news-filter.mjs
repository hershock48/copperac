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

// The schools, 1 Oct 2026. Michigan's needle was "wolverines" only, and ESPN's college copy says
// "Michigan" far more often than "Wolverines", so most Michigan stories fell through and the
// school was nearly absent from the crawl. A bare "michigan" now counts unless the text names
// another Michigan school (lib/news.ts, MICHIGAN_BARE). Same matcher as `names()` there; these
// are the shapes that matter, written rather than captured.
const SCHOOLS = {
  MICHIGAN: {
    needles: ["michigan wolverines", "wolverines"],
    bare: { needle: "michigan", unless: ["michigan state", "central michigan", "western michigan", "eastern michigan", "northern michigan", "michigan tech", "spartans"] },
  },
  "MICH STATE": { needles: ["michigan state", "spartans"] },
};
const namesSchool = (text, club) => {
  const t = text.toLowerCase();
  if (club.needles.some(n => t.includes(n))) return true;
  const b = club.bare;
  return Boolean(b && t.includes(b.needle) && !b.unless.some(u => t.includes(u)));
};
const SCHOOL_CASES = [
  ["MICHIGAN", "No. 20 Michigan holds off Nebraska behind Underwood's three touchdowns", true],
  ["MICHIGAN", "Wolverines land five-star QB for 2027 class", true],
  ["MICHIGAN", "Michigan State stuns Michigan in East Lansing", false],
  ["MICH STATE", "Michigan State stuns Michigan in East Lansing", true],
  ["MICHIGAN", "Central Michigan upsets Toledo on last-second field goal", false],
  ["MICHIGAN", "Big Ten power rankings: Every team after Week 5", false],
  ["MICH STATE", "Spartans' Chiles throws for 400 yards in win over Iowa", true],
  ["MICH STATE", "Big Ten power rankings: Every team after Week 5", false],
];
console.log("\nschools                                                           want  got");
for (const [team, headline, shouldKeep] of SCHOOL_CASES) {
  const got = namesSchool(headline, SCHOOLS[team]);
  const ok = got === shouldKeep;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  " : "XX"} ${team.padEnd(11)}${headline.slice(0,49).padEnd(51)} ${String(shouldKeep).padEnd(5)} ${got}`);
}
console.log(`\n${pass} correct, ${fail} wrong in all`);
if (fail) process.exit(1);
