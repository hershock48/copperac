import { getBoard, type BoardGame } from "@/lib/board";
import { Eyebrow, Heading } from "@/components/ui";

/**
 * The Board — styled like the odds board over a sportsbook counter: slate
 * panel, amber LED numerals, chalk rules. Server-rendered from live ESPN data,
 * revalidated every 15 minutes.
 */
export default async function Board() {
  const board = await getBoard();
  if (!board.ok) return null; // every league failed — say nothing rather than lie

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
            <div className="board-ticker-track">
              {[0, 1].map((dup) => (
                <span key={dup} className="board-ticker-run">
                  {tickerItems.map((g) => (
                    <span key={`${dup}-${g.id}`} className="board-ticker-item">
                      <b>{g.league}</b>
                      <span className="board-ticker-sep">·</span>
                      {g.result
                        ? `${g.result} ${g.detScore}–${g.oppScore} ${g.home ? "vs" : "@"} ${g.opp}`
                        : `${g.home ? "vs" : "@"} ${g.opp} ${g.status}`}
                      <span className="board-ticker-dot">◆</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Panel
            title={board.live.length ? "On now" : "Last out"}
            note={board.live.length ? "Playing right now" : "Recent Detroit results"}
          >
            {(board.live.length ? board.live : board.recent).map((g) => (
              <Row key={g.id} g={g} final />
            ))}
          </Panel>

          <Panel title="On the screens" note="Next up — we'll have it on">
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

        <p className="mt-6 text-xs leading-relaxed text-cream-dim/50">
          Every Detroit game goes up on the wall. Ask and we&apos;ll put your game on a screen too —
          that&apos;s the whole point of the place.
        </p>
      </div>
    </section>
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
        <span className="text-[11px] uppercase tracking-[0.14em] text-cream-dim/45">{note}</span>
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
