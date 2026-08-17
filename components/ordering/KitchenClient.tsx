"use client";

// The kitchen screen: the whole staff surface, one page, three controls.
//
// Design bar: usable by a busy bartender with wet hands on a phone. Big
// targets, no nesting, nothing that needs explaining twice. The chime repeats
// until every new order is acknowledged, because a notification that fires
// once is a notification that gets missed during a Friday rush.
//
// Audio note: browsers refuse to play sound before a user gesture, which is
// why the PIN screen doubles as the audio unlock. The oscillator chime needs
// no asset file and cannot 404.

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderableSection } from "@/lib/ordering/menu";
import type { KitchenState, Order } from "@/lib/ordering/store";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function age(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  return `${mins} min ago`;
}

export default function KitchenClient({ sections }: { sections: OrderableSection[] }) {
  const [authed, setAuthed] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState<KitchenState | null>(null);
  const [backend, setBackend] = useState<"postgres" | "memory" | null>(null);
  const [tab, setTab] = useState<"orders" | "menu">("orders");
  const audioRef = useRef<AudioContext | null>(null);
  const knownRef = useRef<Set<string>>(new Set());

  const chime = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    // Two quick notes, loud enough for a bar. Repeats via the poll loop as
    // long as an unacknowledged order exists.
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.2);
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const [ordersRes, stateRes] = await Promise.all([
        fetch("/api/kitchen/orders", { cache: "no-store" }),
        fetch("/api/kitchen/state", { cache: "no-store" }),
      ]);
      if (ordersRes.status === 401) {
        setAuthed(false);
        return;
      }
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders);
        setBackend(data.backend);
        const fresh = (data.orders as Order[]).filter((o) => o.status === "new");
        // Chime for anything new since last poll, and keep chiming while
        // anything sits unaccepted.
        if (fresh.some((o) => !knownRef.current.has(o.id)) || fresh.length > 0) {
          chime();
        }
        knownRef.current = new Set((data.orders as Order[]).map((o) => o.id));
      }
      if (stateRes.ok) {
        setState((await stateRes.json()).state);
      }
    } catch {
      /* next poll retries; the backend badge covers persistent trouble */
    }
  }, [chime]);

  // A shift cookie survives a reload; making staff re-type the PIN because
  // someone bumped refresh would get this screen abandoned by Friday. Audio
  // stays locked until a tap either way (browser rule), so the board shows a
  // "turn sound on" chip until someone touches it.
  useEffect(() => {
    fetch("/api/kitchen/state", { cache: "no-store" }).then((r) => {
      if (r.ok) setAuthed(true);
    }).catch(() => {});
  }, []);

  const ensureAudio = useCallback(() => {
    audioRef.current ??= new AudioContext();
    audioRef.current.resume();
    setAudioReady(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [authed, poll]);

  async function login() {
    setPinError("");
    const r = await fetch("/api/kitchen/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (r.ok) {
      // The login tap is the user gesture that unlocks audio for the shift.
      ensureAudio();
      setAuthed(true);
      setPin("");
    } else {
      setPinError("Wrong PIN.");
    }
  }

  async function patchState(patch: Record<string, unknown>) {
    const r = await fetch("/api/kitchen/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (r.ok) setState((await r.json()).state);
  }

  async function setOrderStatus(id: string, status: "accepted" | "done") {
    // Optimistic: the tap has to feel instant behind a bar.
    setOrders((os) =>
      status === "done" ? os.filter((o) => o.id !== id) : os.map((o) => (o.id === id ? { ...o, status } : o))
    );
    await fetch("/api/kitchen/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-xs py-16 text-center">
        <p className="display text-xs uppercase tracking-[0.3em] text-copper-light">Kitchen</p>
        <h1 className="display mt-3 text-2xl uppercase text-cream">Start the shift</h1>
        <label className="mt-8 block text-left text-sm text-cream-dim">
          Kitchen PIN
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            className="mt-1 w-full rounded-sm border border-ink-line bg-ink-soft px-3 py-3 text-center text-xl tracking-[0.5em] text-cream outline-none focus:border-copper-light"
          />
        </label>
        {pinError && (
          <p role="alert" className="mt-3 text-sm text-[#d9736b]">{pinError}</p>
        )}
        <button
          type="button"
          onClick={login}
          className="display mt-5 w-full rounded-sm bg-copper px-6 py-4 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-copper-light"
        >
          Open the board
        </button>
        <p className="mt-6 text-xs leading-relaxed text-cream-dim/60">
          Signing in turns the sound on. Keep this open behind the bar; it rings until an order is accepted.
        </p>
      </div>
    );
  }

  const newCount = orders.filter((o) => o.status === "new").length;
  const paused = state?.pausedUntil != null && state.pausedUntil > Date.now();

  return (
    <div className="pb-16">
      {backend === "memory" && (
        <p className="mb-6 rounded-sm border border-[#d9736b]/40 bg-[#d9736b]/10 px-4 py-3 text-sm text-[#d9736b]">
          Running without a database: orders may not reach this screen from other devices. Add the free
          Postgres to the Vercel project before demoing on two devices. See the README.
        </p>
      )}

      {/* Tab rail */}
      <div className="mb-8 flex gap-2">
        {(
          [
            ["orders", newCount > 0 ? `Orders · ${newCount} new` : "Orders"],
            ["menu", "86 board and hours"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`display rounded-sm px-5 py-3 text-xs uppercase tracking-widest transition-colors ${
              tab === key ? "bg-copper text-ink" : "border border-ink-line text-cream-dim hover:border-copper-light"
            }`}
          >
            {label}
          </button>
        ))}
        {!audioReady && (
          <button
            type="button"
            onClick={ensureAudio}
            className="display rounded-sm border border-copper px-5 py-3 text-xs uppercase tracking-widest text-copper-light transition-colors hover:bg-copper hover:text-ink"
          >
            Turn sound on
          </button>
        )}
      </div>

      {tab === "orders" ? (
        <>
          {/* Busy dial and pause: on the orders tab because that is where a
              slammed bartender already is. */}
          <div className="mb-8 flex flex-wrap items-center gap-2">
            <span className="display mr-1 text-xs uppercase tracking-widest text-copper-light">Tonight</span>
            {([0, 15, 30] as const).map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => patchState({ busyMinutes: mins })}
                className={`rounded-sm border px-4 py-2.5 text-sm transition-colors ${
                  state?.busyMinutes === mins && !paused
                    ? "border-copper bg-copper text-ink"
                    : "border-ink-line text-cream-dim hover:border-copper-light"
                }`}
              >
                {mins === 0 ? "Normal" : `Busy +${mins} min`}
              </button>
            ))}
            {paused ? (
              <button
                type="button"
                onClick={() => patchState({ pauseMinutes: 0 })}
                className="rounded-sm border border-[#7dd18a]/50 bg-[#7dd18a]/10 px-4 py-2.5 text-sm text-[#7dd18a]"
              >
                Paused · resumes {Math.max(1, Math.ceil((state!.pausedUntil! - Date.now()) / 60000))} min · tap to resume now
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-cream-dim/70">Pause:</span>
                {[30, 60, 90].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => patchState({ pauseMinutes: mins })}
                    className="rounded-sm border border-ink-line px-3 py-2.5 text-sm text-cream-dim transition-colors hover:border-[#d9736b] hover:text-[#d9736b]"
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            )}
          </div>

          {orders.length === 0 ? (
            <p className="rounded-sm border border-ink-line bg-ink-soft px-5 py-10 text-center text-sm text-cream-dim/70">
              No open orders. This screen checks every few seconds and rings when one lands.
            </p>
          ) : (
            <ul className="space-y-4">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className={`rounded-sm border p-5 ${
                    o.status === "new" ? "border-copper bg-copper/10" : "border-ink-line bg-ink-soft"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="display text-2xl text-cream tabular-nums">
                      #{o.number}
                      <span className="ml-3 text-sm uppercase tracking-widest text-cream-dim">{o.guestName}</span>
                      {o.hasAlcohol && (
                        <span className="ml-3 rounded-sm bg-[#d9736b] px-2 py-0.5 text-xs uppercase tracking-widest text-ink">
                          ID check
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-cream-dim/70">
                      {age(o.createdAt)} · quoted {o.quotedMinutes} min · {money(o.totalCents)}
                    </p>
                  </div>
                  <ul className="mt-3 space-y-1 border-t border-ink-line pt-3 text-sm text-cream-dim">
                    {o.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>
                          <span className="text-cream tabular-nums">{l.qty}×</span> {l.name}
                          {l.options.length > 0 && <span className="text-cream-dim/70"> · {l.options.join(", ")}</span>}
                        </span>
                      </li>
                    ))}
                    {o.note && <li className="pt-1 text-copper-light">Note: {o.note}</li>}
                  </ul>
                  <div className="mt-4 flex gap-3">
                    {o.status === "new" ? (
                      <button
                        type="button"
                        onClick={() => setOrderStatus(o.id, "accepted")}
                        className="display flex-1 rounded-sm bg-copper px-5 py-3.5 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-copper-light"
                      >
                        Accept
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOrderStatus(o.id, "done")}
                        className="display flex-1 rounded-sm border border-copper px-5 py-3.5 text-sm uppercase tracking-widest text-copper-light transition-colors hover:bg-copper hover:text-ink"
                      >
                        Picked up
                      </button>
                    )}
                    <a
                      href={`tel:${o.guestPhone.replace(/\D/g, "")}`}
                      className="display rounded-sm border border-ink-line px-5 py-3.5 text-sm uppercase tracking-widest text-cream-dim transition-colors hover:border-copper-light"
                    >
                      Call
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div>
          <p className="mb-6 max-w-xl text-sm leading-relaxed text-cream-dim/80">
            Tap anything that ran out and it comes off the order page in seconds, marked sold out tonight.
            Tap again when it is back. Ordering opens and closes itself from the posted hours; last online
            order goes in at 9:30 PM.
          </p>
          {sections.map((section) => (
            <section key={section.name} className="mb-8">
              <h2 className="display mb-3 text-sm uppercase tracking-widest text-copper-light">{section.name}</h2>
              <div className="flex flex-wrap gap-2">
                {section.items.map((item) => {
                  const off = state?.unavailable.includes(item.id) ?? false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => patchState({ toggle86: item.id })}
                      aria-pressed={off}
                      className={`rounded-sm border px-4 py-3 text-sm transition-colors ${
                        off
                          ? "border-[#d9736b] bg-[#d9736b]/15 text-[#d9736b] line-through"
                          : "border-ink-line text-cream-dim hover:border-copper-light"
                      }`}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
