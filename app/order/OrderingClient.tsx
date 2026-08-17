"use client";

// The guest side of the ordering demo. Three views in one client component:
// the menu with a running cart, a checkout step, and a confirmation. The
// server (app/api/ordering/route.ts) is the source of truth for prices,
// availability and the busy dial; this component previews the same math from
// lib/ordering.ts and the server recomputes it on submit.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Section } from "@/components/ui";
import {
  BASE_PREP_MIN,
  type BusyLevel,
  type DemoOrder,
  ORDERABLE_MENU,
  ORDER_FEE_CENTS,
  dollars,
  orderTotals,
} from "@/lib/ordering";
import { KITCHEN_NOTE, SITE } from "@/lib/site";

type GuestState = {
  eightySixed: string[];
  busy: BusyLevel;
  quoteMinutes: number;
};

type CartLine = { id: string; qty: number; note: string };
type View = "menu" | "checkout" | "done";

const TIP_PRESETS = [
  { key: "none", label: "No tip", pct: 0 },
  { key: "15", label: "15%", pct: 0.15 },
  { key: "18", label: "18%", pct: 0.18 },
  { key: "20", label: "20%", pct: 0.2 },
] as const;

export default function OrderingClient() {
  const [state, setState] = useState<GuestState>({
    eightySixed: [],
    busy: "normal",
    quoteMinutes: BASE_PREP_MIN,
  });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [view, setView] = useState<View>("menu");
  const [guestName, setGuestName] = useState("");
  const [tipKey, setTipKey] = useState<string>("18");
  const [customTip, setCustomTip] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<DemoOrder | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ordering", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {
      // A missed poll is not an event. The next one is in a few seconds.
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  // Moving between views is a page change to the person doing it, so focus
  // follows: the new view's heading, not wherever the old button was.
  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);

  const paused = state.busy === "paused";

  const qtyOf = (id: string) => cart.find((l) => l.id === id)?.qty ?? 0;

  function add(id: string) {
    setCart((c) => {
      const found = c.find((l) => l.id === id);
      if (found)
        return c.map((l) =>
          l.id === id ? { ...l, qty: Math.min(l.qty + 1, 20) } : l
        );
      return [...c, { id, qty: 1, note: "" }];
    });
  }
  function remove(id: string) {
    setCart((c) =>
      c
        .map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );
  }
  function setNote(id: string, note: string) {
    setCart((c) => c.map((l) => (l.id === id ? { ...l, note } : l)));
  }

  const priced = cart
    .map((l) => {
      const item = ORDERABLE_MENU.flatMap((s) => s.items).find(
        (i) => i.id === l.id
      );
      return item
        ? { ...l, name: item.name, priceCents: item.priceCents }
        : null;
    })
    .filter((l): l is CartLine & { name: string; priceCents: number } => !!l);

  const subtotalCents = priced.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const preset = TIP_PRESETS.find((t) => t.key === tipKey);
  const tipCents = preset
    ? Math.round(subtotalCents * preset.pct)
    : Math.max(0, Math.round(Number(customTip || "0") * 100)) || 0;
  const totals = orderTotals(
    priced.map((l) => ({
      id: l.id,
      name: l.name,
      priceCents: l.priceCents,
      qty: l.qty,
    })),
    tipCents
  );
  const itemCount = priced.reduce((s, l) => s + l.qty, 0);

  async function place() {
    setPlacing(true);
    setError(null);
    try {
      const res = await fetch("/api/ordering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "place",
          guestName,
          tipCents,
          lines: cart.map((l) => ({
            id: l.id,
            qty: l.qty,
            note: l.note || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "sold_out") {
          setError(
            `${data.itemName} just sold out. Take it off the order and try again.`
          );
          refresh();
        } else if (data.error === "paused") {
          setError(
            `Ordering is paused right now. Call ${SITE.phone} and the bar will take it.`
          );
          refresh();
        } else if (data.error === "name_required") {
          setError("Add a name for the order so the kitchen can call it out.");
        } else {
          setError("That did not go through. Give it another try.");
        }
        return;
      }
      setPlaced(data.order);
      setCart([]);
      setView("done");
    } catch {
      setError("That did not go through. Check your connection and try again.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <>
      <div className="border-b border-ink-line bg-ink-soft">
        <div className="mx-auto max-w-7xl px-5 pb-10 pt-14 lg:px-8">
          <p className="display text-xs uppercase tracking-[0.3em] text-copper-light">
            Pickup ordering
          </p>
          <h1 className="mt-3 text-3xl uppercase leading-[1.1] text-cream sm:text-4xl">
            Order Online
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-cream-dim">
            The full menu, cocktails to go included, ready for pickup at the
            bar. A 99¢ order fee is added at checkout, that is the whole fee.
          </p>
          <p className="mt-2 text-sm text-cream-dim/70">{KITCHEN_NOTE}</p>
        </div>
      </div>

      <DemoRibbon />

      <StatusBanner state={state} />

      <noscript>
        <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
          <p className="text-base text-cream-dim">
            Online ordering needs JavaScript. Call{" "}
            <a href={SITE.phoneHref} className="text-copper-light underline">
              {SITE.phone}
            </a>{" "}
            and the bar will take your order.
          </p>
        </div>
      </noscript>

      {view === "menu" && (
        <Section className="pb-32">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="sr-only"
          >
            Choose your food
          </h2>
          <div className="columns-1 gap-14 lg:columns-2 xl:columns-3">
            {ORDERABLE_MENU.map((section) => (
              <div key={section.name} className="mb-14 break-inside-avoid">
                <h3 className="display border-b border-copper/40 pb-3 text-xl uppercase tracking-widest text-copper-light">
                  {section.name}
                </h3>
                {section.note && (
                  <p className="mt-3 text-xs text-cream-dim/70">{section.note}</p>
                )}
                <ul className="mt-6 space-y-6">
                  {section.items.map((item) => {
                    const soldOut = state.eightySixed.includes(item.id);
                    const qty = qtyOf(item.id);
                    return (
                      <li key={item.id} className={soldOut ? "opacity-60" : ""}>
                        <div className="flex items-baseline gap-3">
                          <span className="display text-base uppercase tracking-wide text-cream">
                            {item.name}
                          </span>
                          <span
                            className="mx-1 hidden h-px flex-1 self-center bg-ink-line sm:block"
                            aria-hidden="true"
                          />
                          <span className="display shrink-0 text-base text-copper-light">
                            {dollars(item.priceCents)}
                          </span>
                        </div>
                        {item.desc && (
                          <p className="mt-1.5 text-sm leading-relaxed text-cream-dim/70">
                            {item.desc}
                          </p>
                        )}
                        <div className="mt-2.5">
                          {soldOut ? (
                            <p className="display text-xs uppercase tracking-widest text-copper-light">
                              Sold out tonight
                            </p>
                          ) : qty === 0 ? (
                            <button
                              type="button"
                              onClick={() => add(item.id)}
                              disabled={paused}
                              className="display min-h-11 rounded-sm border border-copper px-5 py-2.5 text-xs uppercase tracking-widest text-copper-light transition-colors hover:bg-copper hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-copper-light"
                            >
                              Add<span className="sr-only"> {item.name}</span>
                            </button>
                          ) : (
                            <Stepper
                              qty={qty}
                              name={item.name}
                              onAdd={() => add(item.id)}
                              onRemove={() => remove(item.id)}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {view === "checkout" && (
        <Section className="pb-32">
          <div className="mx-auto max-w-xl">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="display text-2xl uppercase tracking-wide text-cream"
            >
              Your order
            </h2>

            {priced.length === 0 ? (
              <div className="mt-8">
                <p className="text-base text-cream-dim">
                  Nothing in the order yet.
                </p>
                <button
                  type="button"
                  onClick={() => setView("menu")}
                  className="display mt-6 min-h-11 rounded-sm bg-copper px-7 py-3.5 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-copper-light"
                >
                  Back to the menu
                </button>
              </div>
            ) : (
              <>
                <ul className="mt-8 space-y-6 border-b border-ink-line pb-8">
                  {priced.map((l) => (
                    <li key={l.id}>
                      <div className="flex items-center justify-between gap-4">
                        <span className="display text-base uppercase tracking-wide text-cream">
                          {l.name}
                        </span>
                        <span className="display text-base text-copper-light">
                          {dollars(l.priceCents * l.qty)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        <Stepper
                          qty={l.qty}
                          name={l.name}
                          onAdd={() => add(l.id)}
                          onRemove={() => remove(l.id)}
                        />
                        <div className="min-w-48 flex-1">
                          <label
                            htmlFor={`note-${l.id}`}
                            className="sr-only"
                          >
                            Note for {l.name}
                          </label>
                          <input
                            id={`note-${l.id}`}
                            type="text"
                            maxLength={140}
                            value={l.note}
                            onChange={(e) => setNote(l.id, e.target.value)}
                            placeholder="Sauce, no onions, anything else"
                            className="w-full rounded-sm border border-ink-line bg-ink px-3 py-2.5 text-sm text-cream placeholder:text-cream-dim/50"
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <fieldset className="mt-8">
                  <legend className="display text-sm uppercase tracking-widest text-copper-light">
                    Tip the kitchen
                  </legend>
                  <p className="mt-2 text-xs text-cream-dim/70">
                    Every cent of the tip goes to the house, never to the
                    ordering fee.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {TIP_PRESETS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTipKey(t.key)}
                        aria-pressed={tipKey === t.key}
                        className={`display min-h-11 rounded-sm border px-4 py-2.5 text-xs uppercase tracking-widest transition-colors ${
                          tipKey === t.key
                            ? "border-copper bg-copper text-ink"
                            : "border-ink-line text-cream-dim hover:border-copper hover:text-copper-light"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTipKey("custom")}
                      aria-pressed={tipKey === "custom"}
                      className={`display min-h-11 rounded-sm border px-4 py-2.5 text-xs uppercase tracking-widest transition-colors ${
                        tipKey === "custom"
                          ? "border-copper bg-copper text-ink"
                          : "border-ink-line text-cream-dim hover:border-copper hover:text-copper-light"
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {tipKey === "custom" && (
                    <div className="mt-3">
                      <label
                        htmlFor="custom-tip"
                        className="text-sm text-cream-dim"
                      >
                        Custom tip in dollars
                      </label>
                      <input
                        id="custom-tip"
                        type="number"
                        min="0"
                        step="0.25"
                        inputMode="decimal"
                        value={customTip}
                        onChange={(e) => setCustomTip(e.target.value)}
                        className="mt-2 w-32 rounded-sm border border-ink-line bg-ink px-3 py-2.5 text-sm text-cream"
                      />
                    </div>
                  )}
                </fieldset>

                <dl className="mt-8 space-y-2.5 border-t border-ink-line pt-6 text-sm">
                  <Row label="Subtotal" value={dollars(totals.subtotalCents)} />
                  <Row
                    label="Order fee"
                    value={dollars(ORDER_FEE_CENTS)}
                  />
                  <Row
                    label="Estimated tax (6%)"
                    value={dollars(totals.taxCents)}
                  />
                  <Row label="Tip" value={dollars(tipCents)} />
                  <div className="flex items-baseline justify-between border-t border-ink-line pt-3">
                    <dt className="display text-base uppercase tracking-widest text-cream">
                      Total
                    </dt>
                    <dd className="display text-xl text-copper-light">
                      {dollars(totals.totalCents)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-8">
                  <label
                    htmlFor="guest-name"
                    className="display text-sm uppercase tracking-widest text-copper-light"
                  >
                    Name for the order
                  </label>
                  <input
                    id="guest-name"
                    type="text"
                    autoComplete="name"
                    maxLength={60}
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="mt-3 w-full rounded-sm border border-ink-line bg-ink px-4 py-3.5 text-base text-cream"
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="mt-6 rounded-sm border border-copper/50 bg-copper/10 px-4 py-3 text-sm text-cream"
                  >
                    {error}
                  </p>
                )}

                <p className="mt-6 text-xs leading-relaxed text-cream-dim/60">
                  Demo checkout. No card is charged and no payment details are
                  asked for. The live version takes payment here, with the same
                  total you see above.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={place}
                    disabled={placing || paused}
                    className="display min-h-12 flex-1 rounded-sm bg-copper px-7 py-4 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-copper-light disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-copper"
                  >
                    {placing ? "Placing…" : "Place pickup order"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("menu")}
                    className="display min-h-12 rounded-sm border border-copper px-7 py-4 text-sm uppercase tracking-widest text-copper-light transition-colors hover:bg-copper hover:text-ink"
                  >
                    Back to the menu
                  </button>
                </div>
              </>
            )}
          </div>
        </Section>
      )}

      {view === "done" && placed && (
        <Section className="pb-32">
          <div className="mx-auto max-w-xl">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="display text-2xl uppercase tracking-wide text-cream"
            >
              Order {placed.number} is in
            </h2>
            <p className="mt-4 text-base leading-relaxed text-cream-dim">
              Thanks, {placed.guestName}. Ready in about{" "}
              <b className="text-cream">{placed.quoteMinutes} minutes</b>. Pick
              it up at the bar and give your name.
            </p>
            <dl className="mt-8 space-y-2.5 border-t border-ink-line pt-6 text-sm">
              {placed.lines.map((l) => (
                <Row
                  key={l.id}
                  label={`${l.qty} × ${l.name}`}
                  value={dollars(l.priceCents * l.qty)}
                />
              ))}
              <Row label="Order fee" value={dollars(placed.feeCents)} />
              <Row label="Estimated tax" value={dollars(placed.taxCents)} />
              <Row label="Tip" value={dollars(placed.tipCents)} />
              <div className="flex items-baseline justify-between border-t border-ink-line pt-3">
                <dt className="display text-base uppercase tracking-widest text-cream">
                  Total
                </dt>
                <dd className="display text-xl text-copper-light">
                  {dollars(placed.totalCents)}
                </dd>
              </div>
            </dl>
            <p className="mt-8 text-sm text-cream-dim/70">
              Watching the demo? Open{" "}
              <Link
                href="/kitchen"
                className="text-copper-light underline underline-offset-4"
              >
                the kitchen board
              </Link>{" "}
              in another tab and this order is sitting at the top of it.
            </p>
            <button
              type="button"
              onClick={() => {
                setPlaced(null);
                setView("menu");
              }}
              className="display mt-8 min-h-12 rounded-sm border border-copper px-7 py-4 text-sm uppercase tracking-widest text-copper-light transition-colors hover:bg-copper hover:text-ink"
            >
              Start another order
            </button>
          </div>
        </Section>
      )}

      {view === "menu" && itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-copper-dark bg-copper">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
            <p aria-live="polite" className="display text-sm uppercase tracking-widest text-ink">
              {itemCount} {itemCount === 1 ? "item" : "items"} ·{" "}
              {dollars(subtotalCents)}
            </p>
            <button
              type="button"
              onClick={() => setView("checkout")}
              className="display min-h-11 rounded-sm bg-ink px-6 py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-ink-soft"
            >
              Review order
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-cream-dim">{label}</dt>
      <dd className="text-cream">{value}</dd>
    </div>
  );
}

function Stepper({
  qty,
  name,
  onAdd,
  onRemove,
}: {
  qty: number;
  name: string;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="inline-flex items-center rounded-sm border border-copper">
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove one ${name}`}
        className="display min-h-11 min-w-11 px-3 text-base text-copper-light transition-colors hover:bg-copper hover:text-ink"
      >
        −
      </button>
      <span
        aria-label={`${qty} in order`}
        className="display min-w-8 text-center text-sm text-cream"
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add one more ${name}`}
        className="display min-h-11 min-w-11 px-3 text-base text-copper-light transition-colors hover:bg-copper hover:text-ink"
      >
        +
      </button>
    </div>
  );
}

function DemoRibbon() {
  return (
    <div className="border-b border-ink-line bg-ink">
      <div className="mx-auto max-w-7xl px-5 py-4 lg:px-8">
        <p className="text-sm leading-relaxed text-cream-dim">
          <span className="display mr-3 rounded-sm bg-copper px-2.5 py-1 text-xs uppercase tracking-widest text-ink">
            Demo
          </span>
          No payment is taken. Orders land on a demo{" "}
          <Link
            href="/kitchen"
            className="text-copper-light underline underline-offset-4"
          >
            kitchen board
          </Link>{" "}
          you can watch in another tab.
        </p>
      </div>
    </div>
  );
}

function StatusBanner({ state }: { state: GuestState }) {
  if (state.busy === "paused") {
    return (
      <div className="border-b border-ink-line bg-ink-soft">
        <div className="mx-auto max-w-7xl px-5 py-4 lg:px-8">
          <p className="text-sm text-cream">
            Online ordering is paused right now. Call{" "}
            <a href={SITE.phoneHref} className="text-copper-light underline underline-offset-4">
              {SITE.phone}
            </a>{" "}
            and the bar will take your order.
          </p>
        </div>
      </div>
    );
  }
  if (state.busy === "busy" || state.busy === "slammed") {
    return (
      <div className="border-b border-ink-line bg-ink-soft">
        <div className="mx-auto max-w-7xl px-5 py-4 lg:px-8">
          <p className="text-sm text-cream-dim">
            The kitchen is {state.busy === "busy" ? "busy" : "slammed"} tonight.
            Orders are running about{" "}
            <b className="text-cream">{state.quoteMinutes} minutes</b>.
          </p>
        </div>
      </div>
    );
  }
  return null;
}
