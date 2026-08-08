import { unstable_cache } from "next/cache";

/**
 * The Board: live Detroit sports results and upcoming games.
 *
 * Data comes from ESPN's public site API: no key, no account, no vendor
 * lock-in. Fetched on the server and cached for 15 minutes, so the page stays
 * fast and the board is never more than a quarter-hour stale. If a league's
 * request fails we drop that league and still render. The board degrades,
 * the page never breaks.
 */

export type BoardGame = {
  id: string;
  league: League["label"];
  leagueKey: string;
  date: string; // ISO
  /** Detroit's opponent, e.g. "CLE" */
  opp: string;
  oppName: string;
  /** true when Detroit is at home */
  home: boolean;
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

type League = {
  key: string;
  label: "TIGERS" | "LIONS" | "PISTONS" | "RED WINGS";
  sport: string;
  path: string;
};

const LEAGUES: League[] = [
  { key: "mlb", label: "TIGERS", sport: "MLB", path: "baseball/mlb" },
  { key: "nfl", label: "LIONS", sport: "NFL", path: "football/nfl" },
  { key: "nba", label: "PISTONS", sport: "NBA", path: "basketball/nba" },
  { key: "nhl", label: "RED WINGS", sport: "NHL", path: "hockey/nhl" },
];

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

async function fetchLeague(league: League): Promise<BoardGame[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${league.path}/teams/det/schedule`;
  let json: EspnSchedule;
  try {
    // MLB's full-season payload is ~3.4MB, over Next's 2MB data-cache ceiling,
    // so the raw response can't be stored. We cache the small normalized result
    // instead (see the unstable_cache wrapper below), which is a few hundred
    // bytes and is what we actually need.
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
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
      (c) => (detId && String(c?.team?.id) === String(detId)) || c?.team?.abbreviation === "DET"
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
  /** Each Detroit club's next game, so all four always show even out of season */
  nextByTeam: BoardGame[];
  /** ISO timestamp the board was assembled, shown as "as of" on the rail */
  builtAt: string;
  /** false when every league failed; lets the UI show an honest fallback */
  ok: boolean;
};

async function buildBoard(): Promise<Board> {
  const all = (await Promise.all(LEAGUES.map(fetchLeague))).flat();
  const now = Date.now();

  const isFinal = (g: BoardGame) => g.result !== null;
  const isLive = (g: BoardGame) =>
    !isFinal(g) && g.detScore !== null && new Date(g.date).getTime() <= now;

  const recent = all
    .filter(isFinal)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 5);

  const live = all.filter(isLive);

  const upcoming = all
    .filter((g) => !isFinal(g) && !isLive(g) && new Date(g.date).getTime() > now - 60 * 60 * 1000)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 6);

  const order = ["TIGERS", "LIONS", "PISTONS", "RED WINGS"] as const;
  const nextByTeam = order
    .map((label) =>
      all
        .filter((g) => g.league === label && !isFinal(g) && new Date(g.date).getTime() > now)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0]
    )
    .filter((g): g is BoardGame => Boolean(g));

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
const cachedBoard = unstable_cache(buildBoard, ["copper-detroit-board"], {
  revalidate: 900,
});

export async function getBoard(): Promise<Board> {
  return cachedBoard();
}
