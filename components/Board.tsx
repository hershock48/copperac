import { getBoard, type BoardGame } from "@/lib/board";
import { getNews, type NewsItem } from "@/lib/news";
import { Eyebrow, Heading } from "@/components/ui";

/**
 * The Board, styled like the odds board over a sportsbook counter: slate
 * panel, amber LED numerals, chalk rules. Server-rendered from live ESPN data,
 * revalidated every 15 minutes.
 */
export default async function Board() {
  // Both in flight together. The news strip is decoration on top of the scoreboard, so it
  // must never add its latency to the board's — and if it fails it costs nothing.
  const [board, news] = await Promise.all([getBoard(), getNews()]);
  if (!board.ok) return null; // every league failed, so say nothing rather than lie

  const asOf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(board.builtAt));

  const tickerItems = [...board.live, ...board.recent, ...board.upcoming].slice(0, 10);

  return (
    <section id="board" className="border-y border-ink-line bg-ink-soft px-5 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Detroit, on our screens</Eyebrow>
            <Heading className="mt-3">The Board</Heading>
          </div>
          <div className="board-rail display flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cream-dim/70">
            <span className="board-live-dot" aria-hidden="true" />
            Live · as of {asOf} ET
          </div>
        </div>

        {/* crawling ticker, like the rail under a book's board */}
        {tickerItems.length > 0 && (
          <div className="board-ticker mt-8" aria-hidden="true">
            {/* Duration comes from characters, not items. See the note in globals.css: with a
                fixed duration this ticker ran at 27.8 px/s on five August games and 55.7 on a
                ten-game October board — the same CSS, double the speed, purely because the
                distance changed. */}
            <div
              className="board-ticker-track"
              style={{ "--score-chars": runChars(tickerItems.map((g) => g.league + scoreLabel(g))) } as React.CSSProperties}
            >
              {[0, 1].map((dup) => (
                <span key={dup} className="board-ticker-run">
                  {tickerItems.map((g) => (
                    <span key={`${dup}-${g.id}`} className="board-ticker-item">
                      <b>{g.league}</b>
                      <span className="board-ticker-sep">·</span>
                      {scoreLabel(g)}
                      <span className="board-ticker-dot">◆</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Second crawl: Detroit headlines, the way the bottom line runs under a broadcast.
            Renders only if the feed returned something — an empty rail reads as broken. */}
        {news.ok && <NewsCrawl items={news.items} />}

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Panel
            title={board.live.length ? "On now" : "Last out"}
            note={board.live.length ? "Playing right now" : "Recent Detroit results"}
          >
            {(board.live.length ? board.live : board.recent).map((g) => (
              <Row key={g.id} g={g} final />
            ))}
          </Panel>

          <Panel title="On the screens" note="Next up. We'll have it on.">
            {board.upcoming.map((g) => (
              <Row key={g.id} g={g} />
            ))}
          </Panel>
        </div>

        {board.nextByTeam.length > 0 && (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {board.nextByTeam.map((g) => (
              <div key={`team-${g.id}`} className="board-team">
                <span className="board-team-name">{g.league}</span>
                <span className="board-team-game">
                  {g.home ? "vs" : "@"} {g.opp}
                </span>
                <span className="board-team-when">{g.status}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-cream-dim/70">
          Every Detroit game goes up on the wall. Most nights we&apos;ll put yours on a screen
          too &mdash; ask. When Detroit has a big one, it takes the room.
        </p>
      </div>
    </section>
  );
}

/**
 * The score ticker's text for one game. Extracted so the character count that drives the
 * crawl duration is computed from the SAME string that gets rendered — counting one thing and
 * rendering another is how a calibrated speed silently stops being calibrated.
 */
function scoreLabel(g: BoardGame): string {
  return g.result
    ? `${g.result} ${g.detScore}\u2013${g.oppScore} ${g.home ? "vs" : "@"} ${g.opp}`
    : `${g.home ? "vs" : "@"} ${g.opp} ${g.status}`;
}

/** Characters in a run, which is what the crawl actually has to travel. */
function runChars(parts: string[]): number {
  // +3 per item for the separator and the diamond, which occupy width too.
  return parts.reduce((n, t) => n + t.length + 3, 0);
}

/**
 * How long ago a result was, by Detroit calendar day, so "Last out" reads at a
 * glance: "Today", "Yesterday", or "Nd ago". Compared on ET calendar dates, not
 * raw hours, so a game at 9pm and a look at 1am the next day reads "Yesterday",
 * not "4h". Server-rendered inside the 15-minute board cache, so no client clock
 * and no hydration mismatch.
 */
function playedAgo(iso: string): string {
  const day = (d: Date) => {
    // en-CA gives YYYY-MM-DD; parse as UTC midnight to get a stable day index.
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Detroit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
  };
  const days = day(new Date()) - day(new Date(iso));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

/**
 * How old a headline is, but only once that is worth saying.
 *
 * Nothing for anything inside 48 hours: on a crawl of current news "today" is the default and
 * stamping every item with it is noise. Past that the item wears its age, because a nine-day-old
 * story sitting in a news crawl with no date on it is read as tonight's, and out of season that
 * is exactly the item that survives to the top of the list. Fresh news stays clean; older news
 * has to say so.
 */
function ageLabel(published: string | null): string | null {
  if (!published) return null;
  const t = +new Date(published);
  if (!Number.isFinite(t)) return null;
  const hours = (Date.now() - t) / 3_600_000;
  if (hours < 48) return null;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * The headline crawl. Three things here are not obvious.
 *
 * 1. IT IS A REAL LIST, NOT AN ARIA-HIDDEN DECORATION. The score ticker above is hidden from
 *    screen readers because every score in it is repeated in the panels below, so announcing
 *    it twice is noise. These headlines appear nowhere else on the page, so hiding them would
 *    delete content. The first run is a real <ul> of links; only the duplicate run — which
 *    exists purely so the crawl can loop seamlessly — is aria-hidden.
 *
 * 2. IT PAUSES ON HOVER AND ON FOCUS. These items are links, and a link that slides out from
 *    under the cursor cannot be clicked. Pausing is not a nicety here, it is what makes the
 *    feature usable. Focus matters for the same reason at the keyboard: tabbing to a headline
 *    that is drifting away is worse than no crawl at all.
 *
 * 3. THE DUPLICATE RUN IS WHAT MAKES THE LOOP SEAMLESS. The track holds the same items twice
 *    and translates by exactly -50%, so the moment it wraps, run two is sitting precisely
 *    where run one began. Any other distance shows a seam.
 */
function NewsCrawl({ items }: { items: NewsItem[] }) {
  return (
    <div
      className="news-crawl mt-3"
      // Characters, not items, drive the duration -- so the SPEED stays constant rather than
      // the lap time. Item count was the first attempt and it is a poor proxy: measured, these
      // headlines run 405-600px each, a 1.5x spread, so five long ones travel much further than
      // five short ones. Characters track width closely (6.7 px/char measured). See globals.css.
      style={{ "--news-chars": runChars(items.map((n) => n.team + n.headline)) } as React.CSSProperties}
    >
      <span className="news-crawl-label" aria-hidden="true">
        Detroit
      </span>
      <div className="news-crawl-window">
        <div className="news-crawl-track">
          {[0, 1].map((dup) => (
            <ul
              key={dup}
              className="news-crawl-run"
              // Run 1 is the readable one; run 2 only exists to make the wrap seamless.
              aria-hidden={dup === 1 ? "true" : undefined}
            >
              {items.map((n) => (
                <li key={`${dup}-${n.id}`} className="news-crawl-item">
                  <b className="news-crawl-team">{n.team}</b>
                  {n.href ? (
                    <a
                      href={n.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="news-crawl-link"
                      // The duplicate run must not be a second tab stop for the same story.
                      tabIndex={dup === 1 ? -1 : undefined}
                    >
                      {n.headline}
                    </a>
                  ) : (
                    <span>{n.headline}</span>
                  )}
                  {/* A real <time> rather than a bare string, so the date is machine-readable
                      even on the runs where no label is shown. */}
                  {n.published && ageLabel(n.published) && (
                    <time className="news-crawl-age" dateTime={n.published}>
                      {ageLabel(n.published)}
                    </time>
                  )}
                  <span className="news-crawl-dot" aria-hidden="true">
                    ◆
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="board-panel">
      <div className="board-panel-head">
        <span className="display text-sm uppercase tracking-[0.22em] text-copper-light">{title}</span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-cream-dim/70">{note}</span>
      </div>
      <div className="divide-y divide-ink-line/70">{children}</div>
    </div>
  );
}

function Row({ g, final = false }: { g: BoardGame; final?: boolean }) {
  return (
    <div className="board-row">
      <span className="board-league">{g.leagueKey}</span>

      <span className="board-matchup">
        <b className="text-cream">DET</b>
        <span className="board-at">{g.home ? "vs" : "@"}</span>
        <b>{g.opp}</b>
        {/* When it was played. "Last out" lists results newest-first, but with
            no date on any row you cannot tell whether the top one was tonight
            or last week. This sits at the right edge of the matchup, so it
            survives the narrow-screen layout that drops the network column. */}
        {final && (
          <time className="board-when" dateTime={g.date}>
            {playedAgo(g.date)}
          </time>
        )}
      </span>

      {final && g.detScore !== null ? (
        <span className="board-score">
          <span className={g.result === "W" ? "board-win" : g.result === "L" ? "board-loss" : ""}>
            {g.detScore}
          </span>
          <span className="board-dash">–</span>
          <span>{g.oppScore}</span>
          {g.result && <span className={`board-wl board-wl-${g.result}`}>{g.result}</span>}
        </span>
      ) : (
        <span className="board-score board-time">{g.status}</span>
      )}

      <span className="board-net">{g.network ?? (g.home ? "Home" : "Away")}</span>
    </div>
  );
}
