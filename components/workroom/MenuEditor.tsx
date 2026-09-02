"use client";

import { useEffect, useState } from "react";
import { priceError } from "@/lib/workroom/menu-def";
import type { MenuEditorState } from "@/lib/content";

/**
 * The menu, editable: a price, a description and an on/off switch per item,
 * for the main menu and Sunday brunch. Names and sections come from the
 * printed menu and stay in code; when the print changes, the code changes.
 *
 * A box holds the EFFECTIVE value with the built-in one as its placeholder,
 * so clearing a price and saving visibly puts the printed price back.
 */

type Draft = Record<string, { price: string; desc: string; hidden: boolean }>;

export default function MenuEditor() {
  const [state, setState] = useState<MenuEditorState | null>(null);
  const [draft, setDraft] = useState<Draft>({});
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved("");
    setFailed("");
    const found: Record<string, string> = {};
    for (const [key, v] of Object.entries(draft)) {
      const err = priceError(v.price.replace(/^\$/, ""));
      if (err) found[key] = err;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFailed("Check the marked prices.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/workroom/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<MenuEditorState> & { error?: string; errors?: Record<string, string> };
      if (res.ok && data.menus) {
        adopt(data as MenuEditorState);
        setSaved("Saved. The menu shows it within a few seconds.");
      } else if (data.errors) {
        setErrors(data.errors);
        setFailed(data.error || "Check the marked prices.");
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
          to the printed one. Switch an item off to take it off the site without losing it.
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
            {m.sections.map((sec) => (
              <div key={sec.name} className="wr-panel">
                <h3 className="wr-h2" style={{ marginTop: 0 }}>
                  {sec.name}
                </h3>
                {sec.items.map((i) => {
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
              </div>
            ))}
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
