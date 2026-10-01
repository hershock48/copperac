/**
 * Who a headline is about: the clubs, their needles, and the one matcher.
 *
 * Split out of lib/news.ts on 1 Oct 2026 so that lib/__tests__/news-filter.mjs
 * can import the REAL table and the REAL matcher instead of a copy of each.
 * The test used to carry its own needle list and its own two-line matcher,
 * which meant a change here could not fail it. Nothing in this file may
 * import anything: Node runs the test straight from the .ts source
 * (type stripping, Node 22.18+), and an import of next/cache would end that.
 */

export type Club = {
  /** ESPN's sport/league path segment */
  path: string;
  team: "TIGERS" | "LIONS" | "PISTONS" | "RED WINGS" | "MICHIGAN" | "MICH STATE";
  league: "MLB" | "NFL" | "NBA" | "NHL" | "CFB" | "CBB";
  /** Matched against article categories and, failing that, the text */
  needles: string[];
  /**
   * A looser needle that counts only when none of `unless` is present. For
   * Michigan: "michigan" on its own, unless the text names another Michigan
   * school. See the note at CLUBS.
   */
  bare?: { needle: string; unless: string[] };
};

/*
  The two schools joined on 8 Sep 2026 with the board. Their needles are the
  nicknames on purpose: "michigan" alone would file every Michigan State
  story under Michigan, and the reverse. College news is one national feed
  per sport, so the two schools share a fetch (see buildNews).

  1 Oct 2026, meeting note "add Michigan and Michigan State to the ticker":
  Michigan State's needles work because ESPN writes "Michigan State" out.
  Michigan's did not, because ESPN's college copy says "Michigan" far more
  often than "Wolverines" ("No. 20 Michigan holds off Nebraska"), so most
  Michigan stories fell through the filter and the school was nearly absent
  from the crawl. The fix is the `bare` needle: a plain "michigan" counts,
  unless the text names another Michigan school. A story about the rivalry
  game names both, fails Michigan's bare test on "michigan state", and
  files under MICH STATE, which is one entry for one story and fine.
  lib/__tests__/news-filter.mjs pins the shapes.
*/
export const MICHIGAN_BARE: NonNullable<Club["bare"]> = {
  needle: "michigan",
  unless: ["michigan state", "central michigan", "western michigan", "eastern michigan", "northern michigan", "michigan tech", "spartans"],
};

export const CLUBS: Club[] = [
  { path: "baseball/mlb", team: "TIGERS", league: "MLB", needles: ["detroit tigers", "tigers"] },
  { path: "football/nfl", team: "LIONS", league: "NFL", needles: ["detroit lions", "lions"] },
  { path: "basketball/nba", team: "PISTONS", league: "NBA", needles: ["detroit pistons", "pistons"] },
  { path: "hockey/nhl", team: "RED WINGS", league: "NHL", needles: ["detroit red wings", "red wings"] },
  { path: "football/college-football", team: "MICHIGAN", league: "CFB", needles: ["michigan wolverines", "wolverines"], bare: MICHIGAN_BARE },
  { path: "basketball/mens-college-basketball", team: "MICHIGAN", league: "CBB", needles: ["michigan wolverines", "wolverines"], bare: MICHIGAN_BARE },
  { path: "football/college-football", team: "MICH STATE", league: "CFB", needles: ["michigan state", "spartans"] },
  { path: "basketball/mens-college-basketball", team: "MICH STATE", league: "CBB", needles: ["michigan state", "spartans"] },
];

/** Does this lowercased text name the club? The needles, or the bare needle with nothing ruling it out. */
export function names(text: string, club: Club): boolean {
  if (club.needles.some((n) => text.includes(n))) return true;
  const b = club.bare;
  return Boolean(b && text.includes(b.needle) && !b.unless.some((u) => text.includes(u)));
}
