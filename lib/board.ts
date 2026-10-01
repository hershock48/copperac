import { unstable_cache } from "next/cache";

/**
 * The Board: live results and upcoming games for the four Detroit clubs and,
 * since 8 Sep 2026 at the owner's ask, Michigan and Michigan State in
 * football, basketball and hockey.
 *
 * Data comes from ESPN's public site API: no key, no account, no vendor
 * lock-in. Fetched on the server and cached for 15 minutes, so the page stays
 * fast and the board is never more than a quarter-hour stale. If a league's
 * request fails we drop that league and still render. The board degrades,
 * the page never breaks.
 */

export type BoardGame = {
  id: string;
  /** The Copper side of the game: TIGERS, LIONS, ... MICHIGAN, MICH STATE */
  league: Team["label"];
  /** MLB, NFL, NBA, NHL for the clubs; FOOTBALL, BASKETBALL, HOCKEY for the schools */
  leagueKey: string;
  /** true for the two schools, which play three sports under one name */
  school: boolean;
  /** Our side's abbreviation on the row: DET, MICH or MSU */
  us: string;
  date: string; // ISO
  /** The opponent, e.g. "CLE" */
  opp: string;
  oppName: string;
  /** true when our side is at home */
  home: boolean;
  /** Our side's score; the field name predates the schools joining */
  detScore: number | null;
  oppScore: number | null;
  /** W / L / T once final */
  result: "W" | "L" | "T" | null;
  /** "Final", "Final/10", or a tip/first-pitch time */
  status: string;
  /** Carrying network, when ESPN lists one */
  network: string | null;
  venue: string | null;
};

type Team = {
  key: string;
  label: "TIGERS" | "LIONS" | "PISTONS" | "RED WINGS" | "MICHIGAN" | "MICH STATE";
  sport: string;
  path: string;
  /** ESPN's team segment: the abbreviation for the clubs, the numeric id for the schools */
  team: string;
  /** How ESPN abbreviates our side in a competition, the fallback when ids do not line up */
  abbr: string;
  school: boolean;
};

/*
  One row per team per sport. ESPN's college endpoints answer by numeric team
  id (Michigan 130, Michigan State 127; checked 8 Sep 2026: football and hockey
  returned full schedules, basketball an empty list until its season loads,
  which the normaliser treats as "no games", not "failed"). A school's three
  rows share a label, so the card at the bottom of the board shows whichever
  sport plays next.
*/
const TEAMS: Team[] = [
  { key: "mlb", label: "TIGERS", sport: "MLB", path: "baseball/mlb", team: "det", abbr: "DET", school: false },
  { key: "nfl", label: "LIONS", sport: "NFL", path: "football/nfl", team: "det", abbr: "DET", school: false },
  { key: "nba", label: "PISTONS", sport: "NBA", path: "basketball/nba", team: "det", abbr: "DET", school: false },
  { key: "nhl", label: "RED WINGS", sport: "NHL", path: "hockey/nhl", team: "det", abbr: "DET", school: false },
  { key: "um-fb", label: "MICHIGAN", sport: "FOOTBALL", path: "football/college-football", team: "130", abbr: "MICH", school: true },
  { key: "um-bb", label: "MICHIGAN", sport: "BASKETBALL", path: "basketball/mens-college-basketball", team: "130", abbr: "MICH", school: true },
  { key: "um-hk", label: "MICHIGAN", sport: "HOCKEY", path: "hockey/mens-college-hockey", team: "130", abbr: "MICH", school: true },
  { key: "msu-fb", label: "MICH STATE", sport: "FOOTBALL", path: "football/college-football", team: "127", abbr: "MSU", school: true },
  { key: "msu-bb", label: "MICH STATE", sport: "BASKETBALL", path: "basketball/mens-college-basketball", team: "127", abbr: "MSU", school: true },
  { key: "msu-hk", label: "MICH STATE", sport: "HOCKEY", path: "hockey/mens-college-hockey", team: "127", abbr: "MSU", school: true },
];

/** Card order at the bottom of the board; one card per label, whatever sport is next. */
const CARD_ORDER: Team["label"][] = ["TIGERS", "LIONS", "PISTONS", "RED WINGS", "MICHIGAN", "MICH STATE"];

const ET = "America/Detroit";

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * The slice of ESPN's schedule payload we actually read. Everything is optional
 * on purpose: it's a third-party feed with no contract, so the normaliser below
 * treats every field as possibly absent rather than trusting a shape.
 */
type EspnScore = number | string | { value?: number; displayValue?: string };

type EspnCompetitor = {
  team?: { id?: string | number; abbreviation?: string; displayName?: string };
  homeAway?: string;
  winner?: boolean;
  score?: EspnScore;
};

type EspnCompetition = {
  status?: { type?: { state?: string; name?: string; shortDetail?: string } };
  competitors?: EspnCompetitor[];
  broadcasts?: { media?: { shortName?: string } }[];
  venue?: { fullName?: string };
};

type EspnEvent = {
  id?: string | number;
  date?: string;
  competitions?: EspnCompetition[];
};

type EspnSchedule = { team?: { id?: string | number }; events?: EspnEvent[] };

async function fetchTeam(league: Team): Promise<BoardGame[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${league.path}/teams/${league.team}/schedule`;
  let json: EspnSchedule;
  try {
    // MLB's full-season payload is ~3.4MB, over Next's 2MB data-cache ceiling,
    // so the raw response can't be stored. We cache the small normalized result
    // instead (see the unstable_cache wrapper below), which is a few hundred
    // bytes and is what we actually need.
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      // A hung connection must not stall the homepage regeneration; a
      // failed one already falls to the empty board.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    json = (await res.json()) as EspnSchedule;
  } catch {
    return [];
  }

  const detId = json?.team?.id;
  const events: EspnEvent[] = Array.isArray(json?.events) ? json.events : [];

  const games: BoardGame[] = [];
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    // No id or date means we cannot key it or place it on a timeline.
    if (!comp || ev.id == null || !ev.date) continue;

    const state = comp?.status?.type?.state; // pre | in | post
    const name: string = comp?.status?.type?.name ?? "";
    // Postponed, canceled and suspended games are noise on a bar's TV board.
    if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED/i.test(name)) continue;

    const competitors: EspnCompetitor[] = comp?.competitors ?? [];
    const det = competitors.find(
      (c) => (detId && String(c?.team?.id) === String(detId)) || c?.team?.abbreviation === league.abbr
    );
    const opp = competitors.find((c) => c !== det);
    if (!det || !opp) continue;

    const num = (v: EspnScore | undefined) => {
      const n =
        typeof v === "object" && v !== null ? Number(v.value ?? v.displayValue) : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const detScore = state === "pre" ? null : num(det.score);
    const oppScore = state === "pre" ? null : num(opp.score);

    let result: BoardGame["result"] = null;
    if (state === "post") {
      if (det.winner === true) result = "W";
      else if (opp.winner === true) result = "L";
      else if (detScore !== null && oppScore !== null)
        result = detScore > oppScore ? "W" : detScore < oppScore ? "L" : "T";
    }

    games.push({
      id: String(ev.id),
      league: league.label,
      leagueKey: league.sport,
      school: league.school,
      us: league.abbr,
      date: ev.date,
      opp: opp?.team?.abbreviation ?? "TBD",
      oppName: opp?.team?.displayName ?? "",
      home: det?.homeAway === "home",
      detScore,
      oppScore,
      result,
      status:
        state === "post"
          ? comp?.status?.type?.shortDetail ?? "Final"
          : state === "in"
            ? comp?.status?.type?.shortDetail ?? "Live"
            : fmtTime(ev.date),
      network: comp?.broadcasts?.[0]?.media?.shortName ?? null,
      venue: comp?.venue?.fullName ?? null,
    });
  }
  return games;
}

export type Board = {
  recent: BoardGame[];
  upcoming: BoardGame[];
  live: BoardGame[];
  /** Each team's next game, so all six always show even out of season */
  nextByTeam: BoardGame[];
  /** ISO timestamp the board was assembled, shown as "as of" on the rail */
  builtAt: string;
  /** false when every league failed; lets the UI show an honest fallback */
  ok: boolean;
};

/**
 * How far back a result, or ahead a game, can be and still earn a team its
 * guaranteed row. Two weeks covers a bye week. A team outside it is in its
 * offseason and takes its chances with the rest.
 */
const TEAM_ROW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const newestFirst = (a: BoardGame, b: BoardGame) => +new Date(b.date) - +new Date(a.date);
const soonestFirst = (a: BoardGame, b: BoardGame) => +new Date(a.date) - +new Date(b.date);

/**
 * One row per ESPN event. The rivalry game is one event fetched twice, once
 * under each school, so without this it sits on the board twice (and React
 * gets two rows with one key). First copy wins, which with CARD_ORDER means
 * Michigan's reading of it; the game is on the board either way.
 */
function uniqueById(games: BoardGame[]): BoardGame[] {
  const seen = new Set<string>();
  return games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
}

/** The guaranteed rows first, then the rest in their own order, up to the cap, no repeats. */
function fill(first: BoardGame[], rest: BoardGame[], cap: number): BoardGame[] {
  return uniqueById([...first, ...rest]).slice(0, cap);
}

async function buildBoard(): Promise<Board> {
  const all = (await Promise.all(TEAMS.map(fetchTeam))).flat();
  const now = Date.now();

  const isFinal = (g: BoardGame) => g.result !== null;
  const isLive = (g: BoardGame) =>
    !isFinal(g) && g.detScore !== null && new Date(g.date).getTime() <= now;

  const live = uniqueById(all.filter(isLive));

  /*
    One row per team first, then the rest by date. Meeting note, 1 Oct 2026:
    "add Michigan and Michigan State to the ticker". They had been in TEAMS
    since 8 Sep and still barely appeared, and this is why: "Last out" was the
    six newest finals and "On the screens" the eight soonest games, full stop.
    In September the Tigers play every night, so six finals were six Tigers
    games, the two schools, who play on Saturday, fell off both panels, and
    the ticker is built from the panels, so they fell off that too. Now every
    team with a result in the last two weeks gets its latest one, every team
    with a game in the next two weeks gets its next one, and the leftover
    slots fill by date exactly as before. A team deep in its offseason still
    drops out rather than parking an April result under "Last out".
  */
  const finals = all.filter(isFinal).sort(newestFirst);
  const lastByTeam = CARD_ORDER
    .map((label) => finals.find((g) => g.league === label && new Date(g.date).getTime() >= now - TEAM_ROW_WINDOW_MS))
    .filter((g): g is BoardGame => Boolean(g));
  const recent = fill(lastByTeam, finals, 6).sort(newestFirst);

  const scheduled = all
    .filter((g) => !isFinal(g) && !isLive(g) && new Date(g.date).getTime() > now - 60 * 60 * 1000)
    .sort(soonestFirst);

  // Every team's next game, for the cards; a game not yet started cannot be
  // live, so nothing here overlaps `live`. Not deduped: a card per team is
  // the point, and in rivalry week both schools' cards show the same game.
  const nextByTeam = CARD_ORDER
    .map((label) =>
      all
        .filter((g) => g.league === label && !isFinal(g) && new Date(g.date).getTime() > now)
        .sort(soonestFirst)[0]
    )
    .filter((g): g is BoardGame => Boolean(g));
  const soonByTeam = nextByTeam.filter((g) => new Date(g.date).getTime() <= now + TEAM_ROW_WINDOW_MS);
  const upcoming = fill(soonByTeam, scheduled, 8).sort(soonestFirst);

  return {
    recent,
    upcoming,
    live,
    nextByTeam,
    builtAt: new Date().toISOString(),
    ok: all.length > 0,
  };
}

/**
 * Cache the *derived* board, small enough to store unlike the raw feeds,
 * for 15 minutes. This keeps the homepage statically rendered while the scores
 * still refresh on their own.
 */
// Key bumped when the game shape changed (8 Sep 2026: us, school), so a
// cached board from before the change cannot render blank labels, and again
// when the panels started guaranteeing every team a row (1 Oct 2026), so the
// schools show on the first request after the deploy and not fifteen
// minutes later.
const cachedBoard = unstable_cache(buildBoard, ["copper-board-v3"], {
  revalidate: 900,
});

export async function getBoard(): Promise<Board> {
  return cachedBoard();
}
