"use client";

// The guest side of online ordering.
//
// One client component on purpose: the cart, the menu and the checkout are one
// conversation, and splitting them across a server boundary would mean lifting
// this state somewhere worse. The menu data itself arrives as a prop from the
// server page, so the only fetches here are live state and the order itself.
//
// The order fee is disclosed twice before any card could ever be involved:
// in the banner above the menu and as a labeled line in the cart. That is the
// whole compliance posture (surprise fees are the sin, small fees are not),
// and it is also the pitch, so it is written in the bar's voice, not buried.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderableSection } from "@/lib/ordering/menu";

type LiveState = {
  open: boolean;
  reason: string;
  unavailable: string[];
  quoteMinutes: number;
  feeCents: number;
  feeLabel: string;
  feeExplainer: string;
  taxRate: number;
  demo: boolean;
};

type CartLine = {
  key: string;
  itemId: string;
  name: string;
  unitCents: number;
  qty: number;
  options: string[];
  ageRestricted: boolean;
};

type Confirmation = {
  id: string;
  number: number;
  quotedMinutes: number;
  totalCents: number;
  status: "new" | "accepted" | "done";
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function OrderClient({ sections }: { sections: OrderableSection[] }) {
  const [live, setLive] = useState<LiveState | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  const refreshLive = useCallback(async () => {
    try {
      const r = await fetch("/api/ordering/state", { cache: "no-store" });
      if (r.ok) setLive(await r.json());
    } catch {
      /* keep the last known state; the order POST is the arbiter anyway */
    }
  }, []);

  useEffect(() => {
    refreshLive();
    const t = setInterval(refreshLive, 30000);
    return () => clearInterval(t);
  }, [refreshLive]);

  // Confirmation polling: the "Accepted" flip is the product moment, worth a
  // 5 second poll for the few minutes anyone watches this screen.
  useEffect(() => {
    if (!confirmation || confirmation.status !== "new") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/ordering/order?id=${confirmation.id}`, { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setConfirmation((c) => (c ? { ...c, status: data.status } : c));
        }
      } catch {
        /* transient; next tick retries */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [confirmation]);

  const unavailable = useMemo(() => new Set(live?.unavailable ?? []), [live]);

  function addToCart(line: Omit<CartLine, "key" | "qty">) {
    const key = `${line.itemId}|${[...line.options].sort().join(",")}`;
    setCart((c) => {
      const existing = c.find((l) => l.key === key);
      if (existing) {
        return c.map((l) => (l.key === key ? { ...l, qty: Math.min(12, l.qty + 1) } : l));
      }
      return [...c, { ...line, key, qty: 1 }];
    });
    setOpenItem(null);
  }

  function setQty(key: string, qty: number) {
    setCart((c) =>
      qty <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty } : l))
    );
  }

  const subtotal = cart.reduce((s, l) => s + l.unitCents * l.qty, 0);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const hasAlcohol = cart.some((l) => l.ageRestricted);

  if (confirmation) {
    return <Confirmed confirmation={confirmation} />;
  }

  return (
    <div className="pb-28">
      {/* The fee, said plainly before anything else. */}
      <div className="mb-10 rounded-sm border border-ink-line bg-ink-soft px-5 py-4 text-sm leading-relaxed text-cream-dim">
        <p>
          <span className="text-cream">Pickup ordering, straight from our kitchen.</span>{" "}
          Every order has a {live?.feeLabel ?? "99¢ order fee"}. {live?.feeExplainer ?? "Half of it stays right here at the bar."}{" "}
          No markups, no delivery apps, no middleman menu prices.
        </p>
        {live && !live.open && (
          <p className="mt-3 border-t border-ink-line pt-3 text-copper-light">{live.reason}</p>
        )}
        {live?.open && (
          <p className="mt-2 text-cream-dim/70">
            Ready in about {live.quoteMinutes} minutes tonight.
          </p>
        )}
      </div>

      {sections.map((section) => (
        <section key={section.name} aria-label={section.name} className="mb-12">
          <h2 className="display mb-1 text-2xl uppercase text-cream">{section.name}</h2>
          {section.ageRestricted && (
            <p className="mb-4 text-xs text-cream-dim/70">
              21 and over. A valid ID gets checked at pickup, same as at the bar.
            </p>
          )}
          <ul className="mt-4 divide-y divide-ink-line border-y border-ink-line">
            {section.items.map((item) => {
              const soldOut = unavailable.has(item.id);
              const isOpen = openItem === item.id;
              return (
                <li key={item.id} className="py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className={soldOut ? "opacity-45" : ""}>
                      <p className="text-base text-cream">
                        {item.name}
                        {soldOut && (
                          <span className="display ml-3 text-[11px] uppercase tracking-widest text-copper-light">
                            Sold out tonight
                          </span>
                        )}
                      </p>
                      {item.desc && (
                        <p className="mt-1 max-w-xl text-sm leading-relaxed text-cream-dim/80">{item.desc}</p>
                      )}
                    </div>
                    <div className="flex flex-none items-center gap-4">
                      <span className="text-sm text-cream-dim tabular-nums">{money(item.priceCents)}</span>
                      <button
                        type="button"
                        disabled={soldOut || !live?.open}
                        onClick={() =>
                          item.options.length > 0
                            ? setOpenItem(isOpen ? null : item.id)
                            : addToCart({
                                itemId: item.id,
                                name: item.name,
                                unitCents: item.priceCents,
                                options: [],
                                ageRestricted: item.ageRestricted,
                              })
                        }
                        className="display rounded-sm border border-copper px-4 py-2 text-xs uppercase tracking-widest text-copper-light transition-colors hover:bg-copper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-copper-light"
                        aria-expanded={item.options.length > 0 ? isOpen : undefined}
                      >
                        {item.options.length > 0 ? "Choose" : "Add"}
                      </button>
                    </div>
                  </div>
                  {isOpen && !soldOut && (
                    <OptionPicker
                      item={item}
                      onAdd={(options, unitCents) =>
                        addToCart({
                          itemId: item.id,
                          name: item.name,
                          unitCents,
                          options,
                          ageRestricted: item.ageRestricted,
                        })
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Cart bar: always reachable, never in the way. */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-line bg-ink/95 px-5 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <p className="text-sm text-cream-dim">
              {cartCount} item{cartCount === 1 ? "" : "s"} · <span className="text-cream tabular-nums">{money(subtotal)}</span>
            </p>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="display rounded-sm bg-copper px-6 py-3 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-copper-light"
            >
              Review order
            </button>
          </div>
        </div>
      )}

      {cartOpen && live && (
        <Checkout
          live={live}
          cart={cart}
          subtotal={subtotal}
          hasAlcohol={hasAlcohol}
          setQty={setQty}
          placing={placing}
          error={error}
          onClose={() => setCartOpen(false)}
          onPlace={async (form) => {
            setPlacing(true);
            setError("");
            try {
              const r = await fetch("/api/ordering/order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  guestName: form.name,
                  guestPhone: form.phone,
                  note: form.note,
                  tipCents: form.tipCents,
                  ageAcknowledged: form.ageAcknowledged,
                  lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, options: l.options })),
                }),
              });
              const data = await r.json();
              if (!r.ok) {
                setError(data.error ?? "Something went wrong. The phone still works.");
                refreshLive(); // an 86 or a pause mid-checkout shows up right away
              } else {
                setConfirmation({
                  id: data.id,
                  number: data.number,
                  quotedMinutes: data.quotedMinutes,
                  totalCents: data.totals.totalCents,
                  status: "new",
                });
                setCart([]);
                setCartOpen(false);
              }
            } catch {
              setError("Could not reach the kitchen. Check your connection and try again, or call the bar.");
            } finally {
              setPlacing(false);
            }
          }}
        />
      )}
    </div>
  );
}

/* ------------------------- option picker ------------------------- */

function OptionPicker({
  item,
  onAdd,
}: {
  item: OrderableSection["items"][number];
  onAdd: (options: string[], unitCents: number) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  const chosen = Object.values(picked).flat();
  const optionCents = item.options
    .flatMap((g) => g.choices)
    .filter((c) => chosen.includes(c.name))
    .reduce((s, c) => s + c.priceCents, 0);
  const ready = item.options.every((g) => !g.required || (picked[g.name]?.length ?? 0) === 1);

  return (
    <div className="mt-4 rounded-sm border border-ink-line bg-ink-soft p-4">
      {item.options.map((group) => (
        <fieldset key={group.name} className="mb-4 last:mb-0">
          <legend className="display mb-2 text-xs uppercase tracking-widest text-copper-light">
            {group.name}
            {!group.required && <span className="ml-2 normal-case tracking-normal text-cream-dim/60">optional</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.choices.map((choice) => {
              const on = picked[group.name]?.includes(choice.name) ?? false;
              return (
                <label
                  key={choice.name}
                  className={`cursor-pointer rounded-sm border px-3 py-2 text-sm transition-colors ${
                    on
                      ? "border-copper bg-copper text-ink"
                      : "border-ink-line text-cream-dim hover:border-copper-light"
                  }`}
                >
                  <input
                    type={group.required ? "radio" : "checkbox"}
                    name={`${item.id}-${group.name}`}
                    checked={on}
                    onChange={() =>
                      setPicked((p) => ({
                        ...p,
                        [group.name]: group.required ? [choice.name] : on ? [] : [choice.name],
                      }))
                    }
                    className="sr-only"
                  />
                  {choice.name}
                  {choice.priceCents > 0 && ` +${money(choice.priceCents)}`}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={!ready}
        onClick={() => onAdd(chosen, item.priceCents + optionCents)}
        className="display mt-2 rounded-sm bg-copper px-5 py-2.5 text-xs uppercase tracking-widest text-ink transition-colors hover:bg-copper-light disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add · {money(item.priceCents + optionCents)}
      </button>
    </div>
  );
}

/* ---------------------------- checkout ---------------------------- */

function Checkout({
  live,
  cart,
  subtotal,
  hasAlcohol,
  setQty,
  placing,
  error,
  onClose,
  onPlace,
}: {
  live: LiveState;
  cart: CartLine[];
  subtotal: number;
  hasAlcohol: boolean;
  setQty: (key: string, qty: number) => void;
  placing: boolean;
  error: string;
  onClose: () => void;
  onPlace: (form: { name: string; phone: string; note: string; tipCents: number; ageAcknowledged: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [ageOk, setAgeOk] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const tipCents = tipPct === null ? 0 : Math.round((subtotal * tipPct) / 100);
  const taxCents = Math.round((subtotal + live.feeCents) * live.taxRate);
  const total = subtotal + live.feeCents + tipCents + taxCents;
  const canPlace =
    cart.length > 0 && name.trim().length > 0 && phone.replace(/\D/g, "").length >= 10 && (!hasAlcohol || ageOk) && !placing && live.open;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label="Your order">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto border border-ink-line bg-ink p-5 sm:rounded-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="display text-xl uppercase text-cream">Your order</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm px-3 py-1.5 text-sm text-cream-dim hover:text-cream"
          >
            Back to menu
          </button>
        </div>

        <ul className="divide-y divide-ink-line border-y border-ink-line">
          {cart.map((line) => (
            <li key={line.key} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm text-cream">{line.name}</p>
                {line.options.length > 0 && (
                  <p className="text-xs text-cream-dim/70">{line.options.join(", ")}</p>
                )}
              </div>
              <div className="flex flex-none items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty(line.key, line.qty - 1)}
                  aria-label={`Remove one ${line.name}`}
                  className="h-8 w-8 rounded-sm border border-ink-line text-cream-dim hover:border-copper-light"
                >
                  −
                </button>
                <span className="w-5 text-center text-sm text-cream tabular-nums">{line.qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(line.key, Math.min(12, line.qty + 1))}
                  aria-label={`Add one ${line.name}`}
                  className="h-8 w-8 rounded-sm border border-ink-line text-cream-dim hover:border-copper-light"
                >
                  +
                </button>
                <span className="w-16 text-right text-sm text-cream-dim tabular-nums">
                  {money(line.unitCents * line.qty)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Totals, with the fee named and explained where the money is. */}
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between text-cream-dim">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{money(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-cream-dim">
            <dt>
              Order fee <span className="text-cream-dim/60">· {live.feeExplainer.toLowerCase().replace(/\.$/, "")}</span>
            </dt>
            <dd className="tabular-nums">{money(live.feeCents)}</dd>
          </div>
          <div className="flex justify-between text-cream-dim">
            <dt>Tax</dt>
            <dd className="tabular-nums">{money(taxCents)}</dd>
          </div>
          <div className="flex items-center justify-between text-cream-dim">
            <dt>Tip for the crew</dt>
            <dd className="flex gap-1.5">
              {[null, ...live ? [10, 15, 20] : []].map((pct) => (
                <button
                  key={pct === null ? "none" : pct}
                  type="button"
                  onClick={() => setTipPct(pct)}
                  className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                    tipPct === pct ? "border-copper bg-copper text-ink" : "border-ink-line text-cream-dim hover:border-copper-light"
                  }`}
                >
                  {pct === null ? "None" : `${pct}%`}
                </button>
              ))}
            </dd>
          </div>
          {tipCents > 0 && (
            <div className="flex justify-between text-cream-dim/70">
              <dt>Tip amount</dt>
              <dd className="tabular-nums">{money(tipCents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-ink-line pt-2 text-base text-cream">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(total)}</dd>
          </div>
        </dl>

        <div className="mt-5 space-y-3">
          <label className="block text-sm text-cream-dim">
            Name for the order
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="mt-1 w-full rounded-sm border border-ink-line bg-ink-soft px-3 py-2.5 text-cream outline-none focus:border-copper-light"
            />
          </label>
          <label className="block text-sm text-cream-dim">
            Phone, in case the kitchen has a question
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              autoComplete="tel"
              className="mt-1 w-full rounded-sm border border-ink-line bg-ink-soft px-3 py-2.5 text-cream outline-none focus:border-copper-light"
            />
          </label>
          <label className="block text-sm text-cream-dim">
            Anything the kitchen should know <span className="text-cream-dim/60">(optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              className="mt-1 w-full rounded-sm border border-ink-line bg-ink-soft px-3 py-2.5 text-cream outline-none focus:border-copper-light"
            />
          </label>
          {hasAlcohol && (
            <label className="flex items-start gap-3 rounded-sm border border-ink-line bg-ink-soft px-3 py-3 text-sm text-cream-dim">
              <input
                type="checkbox"
                checked={ageOk}
                onChange={(e) => setAgeOk(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#b86d2a]"
              />
              <span>
                This order has drinks in it. Whoever picks it up is 21 or over and will show a valid ID at the counter.
              </span>
            </label>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-sm border border-[#d9736b]/40 bg-[#d9736b]/10 px-3 py-2.5 text-sm text-[#d9736b]">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!canPlace}
          onClick={() => onPlace({ name: name.trim(), phone, note, tipCents, ageAcknowledged: ageOk })}
          className="display mt-5 w-full rounded-sm bg-copper px-6 py-4 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-copper-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          {placing ? "Sending to the kitchen" : `Place order · ${money(total)}`}
        </button>
        {live.demo && (
          <p className="mt-3 text-center text-xs text-cream-dim/60">{`Demo checkout. No card is charged.`}</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------- confirmation -------------------------- */

function Confirmed({ confirmation }: { confirmation: Confirmation }) {
  const accepted = confirmation.status !== "new";
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <p className="display text-xs uppercase tracking-[0.3em] text-copper-light">Order in</p>
      <p className="display mt-4 text-7xl text-cream tabular-nums">#{confirmation.number}</p>
      <p className="mt-6 text-base leading-relaxed text-cream-dim">
        {accepted
          ? `The kitchen has it. See you in about ${confirmation.quotedMinutes} minutes.`
          : `Sent to the kitchen. Ready in about ${confirmation.quotedMinutes} minutes.`}
      </p>
      <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-3 rounded-sm border border-ink-line bg-ink-soft px-4 py-3">
        <span
          className={`h-2.5 w-2.5 flex-none rounded-full ${accepted ? "bg-[#7dd18a]" : "bg-copper-light"}`}
          aria-hidden
        />
        <p className="text-sm text-cream-dim">
          {accepted ? "Accepted by the kitchen" : "Waiting for the kitchen to accept"}
        </p>
      </div>
      <p className="mt-8 text-sm text-cream-dim/70">
        Total {money(confirmation.totalCents)} · pay at pickup in this demo
      </p>
      <a
        href="/order"
        className="display mt-10 inline-block rounded-sm border border-copper px-6 py-3 text-xs uppercase tracking-widest text-copper-light transition-colors hover:bg-copper hover:text-ink"
      >
        Start another order
      </a>
    </div>
  );
}
