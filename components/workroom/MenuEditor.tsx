"use client";

import { useEffect, useState } from "react";
import { additionError, priceError, type MenuAddition, type MenuId } from "@/lib/workroom/menu-def";
import type { MenuEditorState } from "@/lib/content";

/**
 * The menu, editable, for the main menu and Sunday brunch.
 *
 * Printed items: a price, a description and an on/off switch each. Their
 * names and sections come from the printed menu and stay in code; a box
 * holds the EFFECTIVE value with the built-in one as its placeholder, so
 * clearing a price and saving visibly puts the printed price back.
 *
 * Her own items (1 Oct 2026, the brunch menu changes monthly): "Add an item"
 * under any section puts a blank row there, "Add a section" starts a new
 * one with its first row, and "Remove" takes an added row out again. None
 * of it reaches the site until Save, which sends the whole screen at once.
 */

type Draft = Record<string, { price: string; desc: string; hidden: boolean }>;

let tmpCounter = 0;
/** An id for a row that has not been saved yet. The route mints the real one. */
function tmpId(): string {
  tmpCounter += 1;
  return `tmp_${Date.now().toString(36)}_${tmpCounter}`;
}

export default function MenuEditor() {
  const [state, setState] = useState<MenuEditorState | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [added, setAdded] = useState<MenuAddition[]>([]);
  const [newSection, setNewSection] = useState<Record<MenuId, string>>({ food: "", brunch: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [failed, setFailed] = useState("");

  function adopt(s: MenuEditorState) {
    const d: Draft = {};
    for (const m of s.menus) for (const sec of m.sections) for (const i of sec.items) d[i.key] = { price: i.price, desc: i.desc, hidden: i.hidden };
    setState(s);
    setDraft(d);
    setAdded(s.additions);
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workroom/menu", { headers: { Accept: "application/json" } });
        const data = (await res.json().catch(() => ({}))) as Partial<MenuEditorState> & { error?: string };
        if (!res.ok || !data.menus) {
          setLoadError(data.error || "Could not load the menu.");
          return;
        }
        adopt(data as MenuEditorState);
      } catch {
        setLoadError("Could not reach the site.");
      }
    })();
  }, []);

  function update(key: string, patch: Partial<Draft[string]>) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
    setSaved("");
  }

  function updateAdded(id: string, patch: Partial<MenuAddition>) {
    setAdded((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setSaved("");
  }

  function addItem(menu: MenuId, section: string) {
    setAdded((list) => [...list, { id: tmpId(), menu, section, name: "", desc: "", price: "" }]);
    setSaved("");
  }

  function removeAdded(id: string) {
    setAdded((list) => list.filter((a) => a.id !== id));
    setErrors((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
    setSaved("");
  }

  /** A new section is just a first row with a section name the print does not have. */
  function addSection(menu: MenuId) {
    const name = newSection[menu].replace(/\s+/g, " ").trim();
    if (!name) return;
    // If she typed a section that already exists, join it rather than make a twin.
    const existing = sectionsOf(menu).find((s) => s.toLowerCase() === name.toLowerCase());
    addItem(menu, existing ?? name);
    setNewSection((n) => ({ ...n, [menu]: "" }));
  }

  /** Printed sections first, then hers, in the order she first used each name. */
  function sectionsOf(menu: MenuId): string[] {
    const printed = state?.menus.find((m) => m.id === menu)?.sections.map((s) => s.name) ?? [];
    const out = [...printed];
    for (const a of added) if (a.menu === menu && !out.includes(a.section)) out.push(a.section);
    return out;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved("");
    setFailed("");
    const found: Record<string, string> = {};
    for (const [key, v] of Object.entries(draft)) {
      const err = priceError(v.price.replace(/^\$/, ""));
      if (err) found[key] = err;
    }
    for (const a of added) {
      const err = additionError(a);
      if (err) found[a.id] = err;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFailed("Check the marked rows.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/workroom/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: draft, additions: added }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<MenuEditorState> & { error?: string; errors?: Record<string, string> };
      if (res.ok && data.menus) {
        adopt(data as MenuEditorState);
        setSaved("Saved. The menu shows it within a few seconds.");
      } else if (data.errors) {
        setErrors(data.errors);
        setFailed(data.error || "Check the marked rows.");
      } else {
        setFailed(data.error || "That did not save. Your typing is still on screen.");
      }
    } catch {
      setFailed("That did not save. Your typing is still on screen.");
    }
    setBusy(false);
  }

  if (loadError) {
    return (
      <p className="wr-error" role="alert">
        {loadError}
      </p>
    );
  }
  if (!state) return <p className="wr-muted">Loading…</p>;

  return (
    <>
      <div className="wr-head">
        <h1>Menu</h1>
        <p className="wr-muted">
          Change a price or a description and the menu page shows it within a few seconds. Clear a price to go back
          to the printed one. Switch an item off to take it off the site without losing it. Add an item under any
          section, or start a new section, for what the printed menu does not have yet; remove it when it is gone.
        </p>
      </div>

      {state.backend === "memory" && (
        <p className="wr-warn" role="status">
          <strong>No database is connected yet</strong>, so anything saved here is held only in memory and can be
          forgotten by the next restart. Connect a database in Vercel (Storage, then Neon) and this warning goes away.
        </p>
      )}

      <form onSubmit={save} noValidate>
        {state.menus.map((m) => (
          <section key={m.id} aria-labelledby={`wr-m-${m.id}`}>
            <h2 className="wr-h2" id={`wr-m-${m.id}`} style={{ fontSize: 18, marginTop: 40 }}>
              {m.label}
            </h2>
            {sectionsOf(m.id).map((sectionName) => {
              const printed = m.sections.find((s) => s.name === sectionName);
              const mine = added.filter((a) => a.menu === m.id && a.section === sectionName);
              return (
                <div key={sectionName} className="wr-panel">
                  <h3 className="wr-h2" style={{ marginTop: 0 }}>
                    {sectionName}
                    {!printed && <span className="wr-chip wr-chip-on" style={{ marginLeft: 10 }}>Added</span>}
                  </h3>
                  {printed?.items.map((i) => {
                    const v = draft[i.key];
                    if (!v) return null;
                    const err = errors[i.key];
                    const priceId = `p-${i.key.replace(/[^a-z0-9]+/gi, "-")}`;
                    const changed = v.price !== i.builtInPrice || v.desc !== i.builtInDesc || v.hidden;
                    return (
                      <div key={i.key} className={`wr-menu-item wr-field${v.hidden ? " wr-hidden" : ""}`}>
                        <div>
                          <div className="wr-name">
                            <label htmlFor={priceId} style={{ margin: 0 }}>
                              {i.name}
                            </label>
                            {(i.edited || changed) && <span className="wr-chip wr-chip-on">Edited</span>}
                          </div>
                          <textarea
                            aria-label={`${i.name} description`}
                            value={v.desc}
                            placeholder={i.builtInDesc || "No description on the printed menu"}
                            onChange={(e) => update(i.key, { desc: e.target.value })}
                          />
                          <label className="wr-check">
                            <input type="checkbox" checked={v.hidden} onChange={(e) => update(i.key, { hidden: e.target.checked })} />
                            Off the site
                          </label>
                        </div>
                        <div>
                          <div className="wr-price">
                            <span aria-hidden="true">$</span>
                            <input
                              id={priceId}
                              type="text"
                              inputMode="decimal"
                              value={v.price}
                              placeholder={i.builtInPrice || "none"}
                              onChange={(e) => update(i.key, { price: e.target.value })}
                              aria-invalid={err ? true : undefined}
                              aria-describedby={err ? `${priceId}-err` : undefined}
                            />
                          </div>
                          {err && (
                            <p className="wr-field-error" id={`${priceId}-err`} role="alert">
                              {err}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {mine.map((a) => {
                    const err = errors[a.id];
                    const nameId = `a-${a.id}`;
                    return (
                      <div key={a.id} className="wr-menu-item wr-field">
                        <div>
                          <div className="wr-name">
                            <label htmlFor={nameId} style={{ margin: 0 }} className="wr-visually-hidden">
                              Item name
                            </label>
                            <input
                              id={nameId}
                              type="text"
                              style={{ flex: 1, minWidth: 160 }}
                              value={a.name}
                              placeholder="Name, as it should read on the menu"
                              onChange={(e) => updateAdded(a.id, { name: e.target.value })}
                              aria-invalid={err ? true : undefined}
                              aria-describedby={err ? `${nameId}-err` : undefined}
                            />
                            <span className="wr-chip wr-chip-on">Added</span>
                          </div>
                          <textarea
                            aria-label={`${a.name || "New item"} description`}
                            value={a.desc}
                            placeholder="Description, or leave it blank"
                            onChange={(e) => updateAdded(a.id, { desc: e.target.value })}
                          />
                          <button type="button" className="wr-link wr-link-danger" onClick={() => removeAdded(a.id)}>
                            Remove
                          </button>
                        </div>
                        <div>
                          <div className="wr-price">
                            <span aria-hidden="true">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`${a.name || "New item"} price`}
                              value={a.price}
                              placeholder="none"
                              onChange={(e) => updateAdded(a.id, { price: e.target.value })}
                              aria-invalid={err ? true : undefined}
                            />
                          </div>
                          {err && (
                            <p className="wr-field-error" id={`${nameId}-err`} role="alert">
                              {err}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div className="wr-save-row" style={{ marginTop: 12 }}>
                    <button type="button" className="wr-btn wr-btn-ghost" onClick={() => addItem(m.id, sectionName)}>
                      Add an item
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="wr-panel wr-field">
              <label htmlFor={`ns-${m.id}`}>New section</label>
              <div className="wr-two" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start" }}>
                <input
                  id={`ns-${m.id}`}
                  type="text"
                  value={newSection[m.id]}
                  placeholder={m.id === "brunch" ? "October Specials" : "Pizza"}
                  onChange={(e) => setNewSection((n) => ({ ...n, [m.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSection(m.id);
                    }
                  }}
                />
                <button type="button" className="wr-btn wr-btn-ghost" onClick={() => addSection(m.id)} disabled={!newSection[m.id].trim()}>
                  Add a section
                </button>
              </div>
              <p className="wr-help">
                Starts the section with one blank item. A section with no items on it does not show on the site.
              </p>
            </div>
          </section>
        ))}

        <div className="wr-save-row wr-save-sticky">
          <button className="wr-btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save and publish"}
          </button>
          {saved && (
            <span className="wr-saved" role="status">
              {saved}
            </span>
          )}
          {failed && (
            <span className="wr-error" role="alert">
              {failed}
            </span>
          )}
        </div>
      </form>
    </>
  );
}
