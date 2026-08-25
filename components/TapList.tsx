import type { Tap } from "@/lib/taplist";

/**
 * The live tap board, in the sportsbook LED language the sports board
 * already speaks (.board-panel, scanlines, tabular numerals): taps are
 * the bar's scores, so they get the same treatment. Renders ONLY when the
 * feed is live with at least one tap; the menu page owns the fallback
 * (the curls panel), so this component never has an empty state.
 *
 * The date is formatted in the bar's own timezone, not the server's: a
 * lambda in Virginia must not roll the label to tomorrow at 9 PM in
 * Marshall (the truenorth pattern).
 */

function updatedLabel(t: number | null): string | null {
  if (!t) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit",
    month: "long",
    day: "numeric",
  }).format(new Date(t));
}

function price(p?: string) {
  if (!p) return null;
  const n = Number(p);
  if (Number.isNaN(n)) return p;
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function TapRow({ tap }: { tap: Tap }) {
  return (
    <li className="tap-row">
      <div>
        <span className="tap-name">
          {tap.name}
          {tap.low && <span className="tap-chip tap-chip-low">Low</span>}
          {tap.local && <span className="tap-chip tap-chip-local">Michigan</span>}
        </span>
        <span className="tap-brewery">{tap.brewery}</span>
      </div>
      <span className="tap-abv">{tap.abv ?? ""}</span>
      <span className="tap-price">{price(tap.price)}</span>
    </li>
  );
}

export default function TapList({
  taps,
  onDeck,
  updatedAt,
}: {
  taps: Tap[];
  onDeck: Tap[];
  updatedAt: number | null;
}) {
  const updated = updatedLabel(updatedAt);
  return (
    <div className="board-panel mt-6">
      <div className="board-panel-head">
        <h3 className="display text-sm uppercase tracking-[0.25em] text-copper-light">
          On tap
        </h3>
        {updated && (
          <p className="display text-[10.5px] uppercase tracking-[0.14em] text-cream-dim/60">
            Updated {updated}
          </p>
        )}
      </div>
      <ul className="divide-y divide-ink-line">
        {taps.map((tap) => (
          <TapRow key={`${tap.brewery} ${tap.name}`} tap={tap} />
        ))}
      </ul>
      {onDeck.length > 0 && (
        <div className="border-t border-ink-line px-4 py-3">
          {/* Scooplist's own word for "queued to go on next", and it is
              baseball, which is free house voice on this site. */}
          <p className="display text-[10.5px] uppercase tracking-[0.2em] text-cream-dim/50">
            On deck
          </p>
          <p className="mt-1.5 text-sm text-cream-dim/70">
            {onDeck.map((t) => `${t.name} (${t.brewery})`).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
