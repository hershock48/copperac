"use client";

// The menu editor: Toast's back-office menu manager, on the kitchen board.
//
// Everything on the order page is editable here: sections, items, prices,
// descriptions, photos, and the modifier groups with their choices and
// prices. Unlike the 86 board (which saves per tap, because a sold-out tap
// is one fact), the editor batches: edit freely, one Save button, one
// atomic write. That is also how Toast's editor works, so the mental model
// transfers. Unsaved work is flagged loudly and never silently dropped.
//
// Hidden vs 86'd, said here because staff will ask: Hide takes an item off
// the menu indefinitely (seasonal, discontinued). 86 is tonight only.

import { useEffect, useState } from "react";
import type { MenuDocItem, MenuDocSection } from "@/lib/ordering/menu";

function toDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
function toCents(dollars: string): number {
  const n = Math.round(parseFloat(dollars || "0") * 100);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const inputCls =
  "w-full rounded-sm border border-ink-line bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-copper-light";
const smallBtn =
  "rounded-sm border border-ink-line px-3 py-1.5 text-xs text-cream-dim transition-colors hover:border-copper-light";

export default function MenuEditor() {
  const [doc, setDoc] = useState<MenuDocSection[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState("");
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [armDelete, setArmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/kitchen/menu", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setDoc(data.doc))
      .catch(() => setError("Could not load the menu. Refresh the page."));
  }, []);

  function mutate(fn: (d: MenuDocSection[]) => void) {
    setDoc((d) => {
      if (!d) return d;
      const copy = structuredClone(d);
      fn(copy);
      return copy;
    });
    setDirty(true);
    setSavedFlash(false);
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/kitchen/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
      });
      const data = await r.json();
      if (!r.ok) setError(data.error ?? "Save failed.");
      else {
        setDirty(false);
        setSavedFlash(true);
      }
    } catch {
      setError("Could not reach the server. Your edits are still on this screen; try Save again.");
    } finally {
      setSaving(false);
    }
  }

  if (!doc) {
    return <p className="py-10 text-center text-sm text-cream-dim/70">{error || "Loading the menu..."}</p>;
  }

  return (
    <div>
      {/* Save rail: sticky so a long menu never hides the way out. */}
      <div className="sticky top-0 z-30 -mx-1 mb-6 flex flex-wrap items-center gap-3 border-b border-ink-line bg-ink/95 px-1 py-3 backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="display rounded-sm bg-copper px-6 py-3 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-copper-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving" : "Save menu"}
        </button>
        {dirty && <span className="text-sm text-copper-light">Unsaved changes</span>}
        {savedFlash && !dirty && <span className="text-sm text-[#7dd18a]">Saved. Live on the order page.</span>}
        {error && (
          <span role="alert" className="text-sm text-[#d9736b]">{error}</span>
        )}
      </div>

      {doc.map((section, si) => (
        <section key={si} className="mb-8 rounded-sm border border-ink-line bg-ink-soft p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input
              value={section.name}
              onChange={(e) => mutate((d) => { d[si].name = e.target.value; })}
              aria-label="Section name"
              className="display max-w-xs rounded-sm border border-transparent bg-transparent px-2 py-1 text-base uppercase tracking-widest text-copper-light outline-none focus:border-copper-light"
            />
            <label className="flex items-center gap-2 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={section.ageRestricted}
                onChange={(e) => mutate((d) => { d[si].ageRestricted = e.target.checked; })}
                className="h-3.5 w-3.5 accent-[#b86d2a]"
              />
              21+ section
            </label>
            <button
              type="button"
              className={smallBtn}
              onClick={() =>
                mutate((d) => {
                  const name = "New item";
                  d[si].items.unshift({
                    id: `${slug(section.name)}-${slug(name)}-${Math.random().toString(36).slice(2, 7)}`,
                    name,
                    desc: "",
                    priceCents: 0,
                    image: null,
                    groups: [],
                  });
                })
              }
            >
              + Add item
            </button>
            {section.items.length === 0 && (
              <button type="button" className={smallBtn} onClick={() => mutate((d) => { d.splice(si, 1); })}>
                Delete empty section
              </button>
            )}
          </div>

          <ul className="divide-y divide-ink-line">
            {section.items.map((item, ii) => (
              <ItemRow
                key={item.id}
                item={item}
                open={openItem === item.id}
                armDelete={armDelete === item.id}
                onToggle={() => setOpenItem(openItem === item.id ? null : item.id)}
                onDelete={() =>
                  armDelete === item.id
                    ? (mutate((d) => { d[si].items.splice(ii, 1); }), setArmDelete(null))
                    : setArmDelete(item.id)
                }
                onChange={(fn) => mutate((d) => fn(d[si].items[ii]))}
              />
            ))}
          </ul>
        </section>
      ))}

      <button
        type="button"
        className={smallBtn}
        onClick={() => mutate((d) => { d.push({ name: "New section", ageRestricted: false, items: [] }); })}
      >
        + Add section
      </button>
    </div>
  );
}

function ItemRow({
  item,
  open,
  armDelete,
  onToggle,
  onDelete,
  onChange,
}: {
  item: MenuDocItem;
  open: boolean;
  armDelete: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onChange: (fn: (i: MenuDocItem) => void) => void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className={`text-sm ${item.hidden ? "text-cream-dim/50 line-through" : "text-cream"}`}>
            {item.name || "(unnamed)"}
          </span>
          {item.hidden && (
            <span className="display ml-2 text-[10px] uppercase tracking-widest text-cream-dim/60">hidden</span>
          )}
        </button>
        <span className="text-sm text-cream-dim tabular-nums">${toDollars(item.priceCents)}</span>
        <button type="button" onClick={onToggle} className={smallBtn}>
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 rounded-sm border border-ink-line bg-ink p-4">
          <div className="flex flex-wrap gap-3">
            <label className="flex-1 text-xs text-cream-dim">
              Name
              <input value={item.name} onChange={(e) => onChange((i) => { i.name = e.target.value; })} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="w-28 text-xs text-cream-dim">
              Price $
              <input
                inputMode="decimal"
                defaultValue={toDollars(item.priceCents)}
                onBlur={(e) => {
                  const cents = toCents(e.target.value);
                  e.target.value = toDollars(cents);
                  onChange((i) => { i.priceCents = cents; });
                }}
                className={`mt-1 ${inputCls} tabular-nums`}
              />
            </label>
          </div>
          <label className="block text-xs text-cream-dim">
            Description
            <textarea
              value={item.desc}
              onChange={(e) => onChange((i) => { i.desc = e.target.value; })}
              rows={2}
              className={`mt-1 ${inputCls} leading-relaxed`}
            />
          </label>
          <label className="block text-xs text-cream-dim">
            Photo URL <span className="text-cream-dim/60">(blank for no photo; direct upload is coming)</span>
            <input
              value={item.image ?? ""}
              onChange={(e) => onChange((i) => { i.image = e.target.value.trim() || null; })}
              className={`mt-1 ${inputCls}`}
            />
          </label>

          <OptionGroups item={item} onChange={onChange} />

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-line pt-3">
            <label className="flex items-center gap-2 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={item.hidden ?? false}
                onChange={(e) => onChange((i) => { i.hidden = e.target.checked || undefined; })}
                className="h-3.5 w-3.5 accent-[#b86d2a]"
              />
              Hidden from the order page (seasonal or discontinued; tonight-only is the 86 board)
            </label>
            <button
              type="button"
              onClick={onDelete}
              className={`ml-auto rounded-sm border px-3 py-1.5 text-xs transition-colors ${
                armDelete ? "border-[#d9736b] bg-[#d9736b] text-ink" : "border-ink-line text-cream-dim/70 hover:border-[#d9736b] hover:text-[#d9736b]"
              }`}
            >
              {armDelete ? "Confirm delete" : "Delete item"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function OptionGroups({
  item,
  onChange,
}: {
  item: MenuDocItem;
  onChange: (fn: (i: MenuDocItem) => void) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="display text-[10px] uppercase tracking-widest text-copper-light">Options</p>
      {item.groups.map((group, gi) => (
        <div key={gi} className="rounded-sm border border-ink-line p-3">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <input
              value={group.name}
              onChange={(e) => onChange((i) => { i.groups[gi].name = e.target.value; })}
              aria-label="Option group name"
              className={`max-w-[14rem] ${inputCls}`}
            />
            <label className="flex items-center gap-1.5 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(e) => onChange((i) => { i.groups[gi].required = e.target.checked; })}
                className="h-3.5 w-3.5 accent-[#b86d2a]"
              />
              required
            </label>
            <label className="flex items-center gap-1.5 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={group.multi}
                onChange={(e) => onChange((i) => { i.groups[gi].multi = e.target.checked; })}
                className="h-3.5 w-3.5 accent-[#b86d2a]"
              />
              pick many
            </label>
            <button
              type="button"
              className={`ml-auto ${smallBtn}`}
              onClick={() => onChange((i) => { i.groups.splice(gi, 1); })}
            >
              Remove group
            </button>
          </div>
          {group.choices.map((choice, ci) => (
            <div key={ci} className="mb-1.5 flex items-center gap-2">
              <input
                value={choice.name}
                onChange={(e) => onChange((i) => { i.groups[gi].choices[ci].name = e.target.value; })}
                aria-label="Choice name"
                className={`flex-1 ${inputCls}`}
              />
              <span className="text-xs text-cream-dim">+$</span>
              <input
                inputMode="decimal"
                defaultValue={toDollars(choice.priceCents)}
                onBlur={(e) => {
                  const cents = toCents(e.target.value);
                  e.target.value = toDollars(cents);
                  onChange((i) => { i.groups[gi].choices[ci].priceCents = cents; });
                }}
                aria-label="Choice price"
                className={`w-20 ${inputCls} tabular-nums`}
              />
              <button
                type="button"
                aria-label="Remove choice"
                className={smallBtn}
                onClick={() => onChange((i) => { i.groups[gi].choices.splice(ci, 1); })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className={smallBtn}
            onClick={() => onChange((i) => { i.groups[gi].choices.push({ name: "", priceCents: 0 }); })}
          >
            + Choice
          </button>
        </div>
      ))}
      <button
        type="button"
        className={smallBtn}
        onClick={() =>
          onChange((i) => {
            i.groups.push({ name: "New options", required: false, multi: true, choices: [{ name: "", priceCents: 0 }] });
          })
        }
      >
        + Option group
      </button>
    </div>
  );
}
