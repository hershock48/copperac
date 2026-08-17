"use client";

// The staff side of the ordering demo, built for the tablet behind the bar or
// a phone in an apron pocket. Three controls and a list: the busy dial, the
// 86 board, and the orders themselves, new ones pinned to the top until the
// accept tap. The accept tap is the point: it is the delivery confirmation a
// fire-and-forget printer cannot give.
//
// Demo boundary: no PIN. In service this page sits behind one. On the README
// checklist, next to the other things the demo deliberately leaves out.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUSY_LEVELS,
  type BusyLevel,
  type DemoOrder,
  FEE_SHARE_CENTS,
  ORDERABLE_MENU,
  dollars,
} from "@/lib/ordering";

type KitchenState = {
  eightySixed: string[];
  busy: BusyLevel;
  quoteMinutes: number;
  orders: DemoOrder[];
};

export default function KitchenClient() {
  const [state, setState] = useState<KitchenState | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [showEightySix, setShowEightySix] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);
  const soundOnRef = useRef(false);
  soundOnRef.current = soundOn;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ordering?scope=kitchen", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const next: KitchenState = await res.json();
      setState(next);

      // Chime on arrivals only. The first poll seeds the known set silently,
      // otherwise reopening the board replays a chime per existing order.
      const ids = new Set(next.orders.map((o) => o.id));
      if (knownIds.current) {
        let fresh = false;
        for (const id of ids) if (!knownIds.current.has(id)) fresh = true;
        if (fresh && soundOnRef.current) chime();
      }
      knownIds.current = ids;
    } catch {
      // Missed poll. The next one is four seconds out.
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function post(body: Record<string, unknown>) {
    try {
      const res = await fetch("/api/ordering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) setState(await res.json());
    } catch {
      // The next poll self-heals whatever this call missed.
    }
  }

  const orders = state?.orders ?? [];
  const newCount = orders.filter((o) => o.status === "new").length;
  const feeShareCents = orders.length * FEE_SHARE_CENTS;
  const eightySixed = new Set(state?.eightySixed ?? []);

  return (
    <div className="min-h-screen bg-ink pb-20">
      <div className="border-b border-ink-line bg-ink-soft">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="display text-xs uppercase tracking-[0.3em] text-copper-light">
                Copper Athletic Club
              </p>
              <h1 className="mt-2 text-2xl uppercase text-cream sm:text-3xl">
                Kitchen Board
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setSoundOn((v) => !v)}
              aria-pressed={soundOn}
              className={`display min-h-11 rounded-sm border px-4 py-2.5 text-xs uppercase tracking-widest transition-colors ${
                soundOn
                  ? "border-copper bg-copper text-ink"
                  : "border-ink-line text-cream-dim hover:border-copper hover:text-copper-light"
              }`}
            >
              {soundOn ? "Chime on" : "Chime off"}
            </button>
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-ink-line pt-5">
            <Stat label="Orders tonight" value={String(orders.length)} />
            <Stat label="Waiting on accept" value={String(newCount)} accent={newCount > 0} />
            {/* The number that sells the model: 50¢ of every order fee stays
                with the house. It is the website paying the bar. */}
            <Stat label="Fee share earned" value={dollars(feeShareCents)} />
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-cream-dim/60">
            Demo board. In service this page sits behind a staff PIN, and demo
            orders here reset when the demo redeploys.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5">
        <section className="mt-8" aria-labelledby="busy-heading">
          <h2
            id="busy-heading"
            className="display text-sm uppercase tracking-widest text-copper-light"
          >
            How is the kitchen running?
          </h2>
          <p className="mt-2 text-xs text-cream-dim/70">
            Sets the pickup time quoted to guests. Pause stops new orders on
            the spot; the live version pauses on a timer so a Friday pause
            cannot kill Saturday.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-labelledby="busy-heading">
            {BUSY_LEVELS.map((b) => {
              const active = state?.busy === b.level;
              return (
                <button
                  key={b.level}
                  type="button"
                  onClick={() => post({ action: "busy", level: b.level })}
                  aria-pressed={active}
                  className={`display min-h-12 rounded-sm border px-4 py-3 text-sm uppercase tracking-widest transition-colors ${
                    active
                      ? "border-copper bg-copper text-ink"
                      : "border-ink-line text-cream-dim hover:border-copper hover:text-copper-light"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          {state && (
            <p className="mt-3 text-sm text-cream-dim">
              {state.busy === "paused" ? (
                "Ordering is paused. Guests see it and are pointed at the phone."
              ) : (
                <>
                  Guests are quoted about{" "}
                  <b className="text-cream">{state.quoteMinutes} minutes</b>.
                </>
              )}
            </p>
          )}
        </section>

        <section className="mt-10" aria-labelledby="eightysix-heading">
          <div className="flex items-center justify-between gap-4">
            <h2
              id="eightysix-heading"
              className="display text-sm uppercase tracking-widest text-copper-light"
            >
              The 86 board{eightySixed.size > 0 ? ` (${eightySixed.size} off)` : ""}
            </h2>
            <button
              type="button"
              onClick={() => setShowEightySix((v) => !v)}
              aria-expanded={showEightySix}
              aria-controls="eightysix-panel"
              className="display min-h-11 rounded-sm border border-ink-line px-4 py-2.5 text-xs uppercase tracking-widest text-cream-dim transition-colors hover:border-copper hover:text-copper-light"
            >
              {showEightySix ? "Hide items" : "Show items"}
            </button>
          </div>
          <p className="mt-2 text-xs text-cream-dim/70">
            Tap an item when it runs out. It reads “sold out tonight” on the
            order page within seconds. Tap again to bring it back.
          </p>
          {showEightySix && (
            <div id="eightysix-panel" className="mt-5 space-y-6">
              {ORDERABLE_MENU.map((section) => (
                <div key={section.name}>
                  <h3 className="display text-xs uppercase tracking-widest text-cream-dim">
                    {section.name}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {section.items.map((item) => {
                      const off = eightySixed.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            post({ action: "eightysix", id: item.id, on: !off })
                          }
                          aria-pressed={off}
                          className={`min-h-11 rounded-sm border px-3.5 py-2 text-sm transition-colors ${
                            off
                              ? "border-copper bg-copper/15 text-copper-light line-through"
                              : "border-ink-line text-cream-dim hover:border-copper hover:text-copper-light"
                          }`}
                        >
                          {item.name}
                          <span className="sr-only">
                            {off ? ", sold out, tap to restore" : ", available, tap to 86"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10" aria-labelledby="orders-heading">
          <h2
            id="orders-heading"
            className="display text-sm uppercase tracking-widest text-copper-light"
          >
            Orders
          </h2>
          {orders.length === 0 ? (
            <p className="mt-4 text-sm text-cream-dim">
              Nothing yet. Place one from the order page and it lands here
              within a few seconds.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className={`rounded-sm border p-5 ${
                    o.status === "new"
                      ? "border-copper bg-copper/10"
                      : "border-ink-line bg-ink-soft"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="display text-lg uppercase tracking-wide text-cream">
                      Order {o.number} · {o.guestName}
                    </p>
                    <p className="display text-sm uppercase tracking-widest text-copper-light">
                      {o.status === "new" ? "New" : "Accepted"} ·{" "}
                      {timeOf(o.placedAt)}
                    </p>
                  </div>
                  <ul className="mt-4 space-y-2 border-t border-ink-line/70 pt-4">
                    {o.lines.map((l, i) => (
                      <li key={`${l.id}-${i}`} className="text-sm text-cream-dim">
                        <b className="text-cream">{l.qty} ×</b> {l.name}
                        {l.note && (
                          <span className="mt-0.5 block pl-6 text-copper-light">
                            “{l.note}”
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-ink-line/70 pt-4">
                    <p className="text-sm text-cream-dim">
                      {dollars(o.totalCents)} total · tip {dollars(o.tipCents)} ·
                      quoted {o.quoteMinutes} min
                    </p>
                    {o.status === "new" && (
                      <button
                        type="button"
                        onClick={() => post({ action: "accept", orderId: o.id })}
                        className="display min-h-12 rounded-sm bg-copper px-6 py-3 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-copper-light"
                      >
                        Accept order {o.number}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-cream-dim/70">
        {label}
      </dt>
      <dd
        className={`display mt-1 text-2xl ${accent ? "text-copper-light" : "text-cream"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Two short tones from an oscillator: no audio asset to load, nothing to 404.
// Browsers only allow it after a user gesture, which the chime toggle is.
function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.55);
    };
    play(880, 0);
    play(1175, 0.22);
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // A board that cannot beep still shows the order.
  }
}
