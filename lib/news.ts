import { unstable_cache } from "next/cache";

/**
 * Detroit sports headlines, for the news crawl under the score ticker.
 *
 * SOURCE. The same ESPN public site API the scoreboard already reads — no key, no account,
 * no vendor, nothing to pay for. Using the source that is already in the build rather than
 * adding a second one is the whole point: one thing to watch, one failure mode, and the
 * board and the news can never disagree about who Detroit played.
 *
 * WHY NOT AN RSS FEED. That was the first instinct and it half works. The Lions and Tigers
 * both publish real, current RSS on their official club sites
 * (detroitlions.com/rss/news, mlb.com/tigers/feeds/news/rss.xml — both verified live).
 * The problem is the other two: the NHL retired per-team RSS entirely
 * (nhl.com/redwings/rss/news is a 404) and the NBA serves HTML at the old feed path. So an
 * RSS build covers two clubs in one season each and goes quiet on the other two, which on a
 * sports bar's wall is worse than nothing. One API that covers all four wins.
 *
 * WHY THE FILTER IS ON OUR SIDE. ESPN's news endpoint is league-scoped, so a request for NHL
 * news is mostly not about Detroit, and there is no documented `team=` parameter to lean on.
 *
 * THE FIRST VERSION OF THIS FILTER WAS WRONG, and it is worth saying how, because the failure
 * was invisible in code review and obvious the moment it ran. It trusted each article's
 * `categories` array: if the categories named Detroit, the article was Detroit news. But ESPN
 * tags a league-wide roundup with EVERY team in the league, so "2026 NFL training camp: Latest
 * news, intel for all 32 teams" is categorised under the Lions, and "NHL rookie roundtable" is
 * categorised under the Red Wings. Nine of the first twelve headlines it produced were not
 * about Detroit at all -- a crawl labelled DETROIT carrying generic league copy, which is worse
 * than an empty rail.
 *
 * So the test is now: is the club NAMED in the headline or description? That is what "about
 * Detroit" means. A category tag alone is trusted only when the article is not a roundup, which
 * is measured by counting how many teams it is filed under -- a genuine team story names one or
 * two, a league sweep names a dozen or more.
 *
 * CURRENCY IS THE POINT, so there is a hard age cutoff. Without one this happily served a
 * month-old story as news: the sort takes the newest twelve regardless of age, and a club deep
 * in its offseason has nothing recent, so its newest item might be from three weeks ago and
 * would crawl past looking exactly like tonight's result. Kevin's framing settles what should
 * happen instead — *"I don't expect pistons news when it's not bball season"* — so a club with
 * nothing recent simply drops out of the crawl rather than padding it with old copy. That is
 * why MAX_AGE_DAYS exists and why an item with no date at all is dropped: if its age cannot be
 * established, its currency cannot be claimed.
 *
 * EVERY FIELD IS OPTIONAL. This is an undocumented third-party endpoint with no contract, so
 * the normaliser treats the response as unknown shape and drops anything it cannot read.
 * A league that fails, changes shape, or returns nothing costs us that league and nothing
 * else. If all four fail the strip does not render at all — see `ok`.
 */

export type NewsItem = {
  id: string;
  /** TIGERS | LIONS | PISTONS | RED WINGS */
  team: string;
  /** MLB | NFL | NBA | NHL */
  league: string;
  headline: string;
  href: string | null;
  published: string | null;
};

type Club = {
  /** ESPN's sport/league path segment */
  path: string;
  team: "TIGERS" | "LIONS" | "PISTONS" | "RED WINGS";
  league: "MLB" | "NFL" | "NBA" | "NHL";
  /** Matched against article categories and, failing that, the text */
  needles: string[];
};

const CLUBS: Club[] = [
  { path: "baseball/mlb", team: "TIGERS", league: "MLB", needles: ["detroit tigers", "tigers"] },
  { path: "football/nfl", team: "LIONS", league: "NFL", needles: ["detroit lions", "lions"] },
  { path: "basketball/nba", team: "PISTONS", league: "NBA", needles: ["detroit pistons", "pistons"] },
  { path: "hockey/nhl", team: "RED WINGS", league: "NHL", needles: ["detroit red wings", "red wings"] },
];

/** The slice of ESPN's news payload we read. All optional, on purpose. */
type EspnCategory = {
  type?: string;
  description?: string;
  teamId?: number | string;
  team?: { description?: string; displayName?: string };
  athlete?: { description?: string };
};

type EspnArticle = {
  id?: number | string;
  headline?: string;
  title?: string;
  description?: string;
  published?: string;
  lastModified?: string;
  categories?: EspnCategory[];
  links?: { web?: { href?: string } };
};

type EspnNews = { articles?: EspnArticle[]; headlines?: EspnArticle[] };

/** Text of every category on an article, lowercased, for needle matching. */
function categoryText(a: EspnArticle): string {
  const cats = Array.isArray(a.categories) ? a.categories : [];
  return cats
    .map((c) =>
      [c.description, c.team?.description, c.team?.displayName, c.athlete?.description]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ")
    .toLowerCase();
}

/** How many teams the article is filed under. A league roundup is filed under all of them. */
function teamCategoryCount(a: EspnArticle): number {
  const cats = Array.isArray(a.categories) ? a.categories : [];
  return cats.filter((c) => c.type === "team" || c.teamId != null || c.team != null).length;
}

/** Roundups tagged with a dozen teams are not team news, however they are categorised. */
const ROUNDUP_TEAM_TAGS = 3;

/**
 * Older than this and it is not news any more, it is an archive.
 *
 * Ten days rather than a tighter number because the offseason is the case that matters: a real
 * story out of season -- a GM resigning, a trade -- deserves to stay up for a while when it is
 * the only thing that has happened. Tighter than a week and those vanish; looser than a
 * fortnight and a quiet month starts reading as current.
 */
const MAX_AGE_DAYS = 10;

function concernsClub(a: EspnArticle, club: Club): boolean {
  const text = `${a.headline ?? a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
  // The real test: the story says who it is about. "Teddy Bridgewater leaves Lions to retire"
  // passes; "Latest intel for all 32 teams" does not, whatever it is tagged with.
  if (club.needles.some((n) => text.includes(n))) return true;

  // Tagged but not named. Trust the tag only if this is not a league sweep -- otherwise every
  // roundup in the league arrives wearing Detroit's name. See the note at the top of the file.
  const cats = categoryText(a);
  const tagged = Boolean(cats) && club.needles.some((n) => cats.includes(n));
  return tagged && teamCategoryCount(a) <= ROUNDUP_TEAM_TAGS;
}

async function fetchClubNews(club: Club): Promise<NewsItem[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${club.path}/news?limit=50`;
  let json: EspnNews;
  try {
    // no-store on the raw request, then the small derived list is cached below — the same
    // arrangement lib/board.ts uses, and for the same reason: the raw payloads are large
    // and the thing worth caching is the handful of strings we keep.
    const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
    if (!res.ok) return [];
    json = (await res.json()) as EspnNews;
  } catch {
    return [];
  }

  const raw = Array.isArray(json?.articles)
    ? json.articles
    : Array.isArray(json?.headlines)
      ? json.headlines
      : [];

  const items: NewsItem[] = [];
  for (const a of raw) {
    const headline = (a.headline ?? a.title ?? "").trim();
    if (!headline) continue;
    if (!concernsClub(a, club)) continue;

    const href = a.links?.web?.href ?? null;
    items.push({
      // Fall back to the headline as the key: ESPN sometimes omits the id, and two
      // articles with the same headline are the same article for our purposes.
      id: String(a.id ?? headline),
      team: club.team,
      league: club.league,
      headline,
      href,
      published: a.published ?? a.lastModified ?? null,
    });
  }
  return items;
}

export type NewsFeed = {
  items: NewsItem[];
  builtAt: string;
  /** false when nothing came back; lets the strip render nothing rather than an empty rail */
  ok: boolean;
};

async function buildNews(): Promise<NewsFeed> {
  const all = (await Promise.all(CLUBS.map(fetchClubNews))).flat();

  // Dedupe by id, then by headline — the same story can appear under two categories.
  const seen = new Set<string>();
  const unique = all.filter((n) => {
    const k = n.headline.toLowerCase();
    if (seen.has(n.id) || seen.has(k)) return false;
    seen.add(n.id);
    seen.add(k);
    return true;
  });

  // Drop anything stale, and anything undateable. A crawl is a claim that this is what is
  // happening now; an item whose age cannot be read cannot back that claim.
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const fresh = unique.filter((n) => {
    if (!n.published) return false;
    const t = +new Date(n.published);
    return Number.isFinite(t) && t >= cutoff;
  });

  fresh.sort((a, b) => +new Date(b.published!) - +new Date(a.published!));

  // Interleave by club so one team in mid-season does not fill the whole crawl. Round-robin
  // over the per-club queues, newest first within each, until we have enough.
  const queues = new Map<string, NewsItem[]>();
  for (const n of fresh) {
    const q = queues.get(n.team) ?? [];
    q.push(n);
    queues.set(n.team, q);
  }
  const order = ["TIGERS", "LIONS", "PISTONS", "RED WINGS"];
  const woven: NewsItem[] = [];
  const LIMIT = 12;
  for (let round = 0; woven.length < LIMIT; round += 1) {
    let added = false;
    for (const team of order) {
      const q = queues.get(team);
      if (q && q[round]) {
        woven.push(q[round]);
        added = true;
        if (woven.length >= LIMIT) break;
      }
    }
    if (!added) break; // every queue exhausted
  }

  return { items: woven, builtAt: new Date().toISOString(), ok: woven.length > 0 };
}

/**
 * Ten minutes. Headlines turn over faster than scores settle, but a bar's wall does not
 * need to be a live wire and every revalidation is four upstream requests.
 */
const cachedNews = unstable_cache(buildNews, ["copper-detroit-news"], { revalidate: 600 });

export async function getNews(): Promise<NewsFeed> {
  return cachedNews();
}
