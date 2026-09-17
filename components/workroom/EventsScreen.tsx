"use client";

import { useEffect, useRef, useState } from "react";
import {
  blankEvent,
  contactErrors,
  eventErrors,
  type EventDraft,
  type EventErrors,
  type EventsContact,
  type EditableEvent,
  type EventsListing,
  isEventsListing, isEditableEvent, isEventsContact, revisionToken,
} from "@/lib/workroom/events-def";
import { resizeToJpegDataUrl } from "./resize";
import { ownerRequest } from "@/lib/workroom/owner-request";

/**
 * The events screen: the list, one editor at a time, and who handles events.
 *
 * What the old site did with a flyer, a paragraph and a Toast link, as a
 * form: title, date and times, a price line, the ticket link, a photo, a few
 * bullets. Saving publishes; the events page, the homepage card and the
 * search snippet follow within seconds (the route revalidates the site).
 *
 * Fetches after the gate, like every workroom screen: the server page
 * renders the gate knowing nothing, and the data only travels once the
 * cookie is good.
 */

type Listing = EventsListing;
type Editing = { id: string; revision: string | null; isNew: boolean; draft: EventDraft };

function todayDetroit(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit" }).format(new Date());
}

function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);
}

function prettyTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function EventsScreen() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<EventErrors>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const working = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workroom/events", { headers: { Accept: "application/json" } });
        const data = (await res.json().catch(() => ({}))) as Partial<Listing> & { error?: string };
        if (!res.ok || !isEventsListing(data)) {
          setLoadError(data.error || "Could not load the events.");
          return;
        }
        setListing(data as Listing);
      } catch {
        setLoadError("Could not reach the site.");
      }
    })();
  }, []);

  function startNew() {
    if (working.current) return;
    setEditing({ id: "evt_" + crypto.randomUUID().replaceAll("-", ""), revision: null, isNew: true, draft: blankEvent() });
    setErrors({}); setNote(""); setFailed("");
  }
  function startEdit(e: EditableEvent) {
    if (working.current || editing) return;
    const { id, createdAt, updatedAt, revision, archivedAt, ...draft } = e;
    void createdAt; void updatedAt; void archivedAt;
    setEditing({ id, revision, isNew: false, draft }); setErrors({}); setNote(""); setFailed("");
  }
  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setEditing(current => current ? { ...current, draft: { ...current.draft, [key]: value } } : null);
    setNote("");
  }
  async function mutate(method: "PUT" | "DELETE" | "POST", target: Editing | EditableEvent) {
    if (working.current) return;
    working.current = true; setBusy(true); setFailed(""); setNote("");
    const id = target.id;
    try {
      const body = "draft" in target && method === "PUT" ? { event: { ...target.draft, id }, revision: target.revision } : { id, revision: target.revision };
      const result = await ownerRequest<Listing & { event: EditableEvent }>("/api/workroom/events", method, body,
        (value): value is Listing & { event: EditableEvent } => {
          if (!isEventsListing(value)) return false;
          const acknowledged = (value as Listing & { event?: unknown }).event;
          return isEditableEvent(acknowledged) && acknowledged.id === id && value.events.some(e => e.id === id) && (method === "DELETE" ? Boolean(acknowledged.archivedAt) : !acknowledged.archivedAt) && (method !== "POST" || !acknowledged.published);
        });
      if (result.kind === "saved") {
        setListing(result.data); setEditing(null);
        setNote(result.data.backend === "memory" ? "Saved for this local demo session. Changes disappear after a restart." : method === "DELETE" ? "Archived. You can restore it below." : method === "POST" ? "Restored as a draft. Open it to publish again." : "Saved. Check the public page to confirm how it looks.");
      } else { setErrors(result.errors || {}); setFailed(result.message); }
    } finally { working.current = false; setBusy(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!editing || working.current) return;
    const found = eventErrors(editing.draft); setErrors(found); setFailed("");
    if (Object.keys(found).length) { setFailed("Check the marked fields."); return; }
    await mutate("PUT", editing);
  }
  async function remove() {
    if (!editing || editing.isNew || working.current) return;
    if (!window.confirm("Archive this event? It will come off the site, and you can restore it below.")) return;
    await mutate("DELETE", editing);
  }
  async function pickPhoto(file: File | undefined) {
    if (!file || !editing || working.current) return;
    const targetId = editing.id;
    working.current = true; setUploading(true); setFailed("");
    try {
      let dataUrl: string;
      try { dataUrl = await resizeToJpegDataUrl(file); }
      catch { setFailed("The photo could not be read. Your draft and previous photo are still here. Try a JPEG, PNG or WebP."); return; }
      const result = await ownerRequest<{ id: string; url: string }>("/api/workroom/events/image", "POST", { dataUrl },
        (value): value is { id: string; url: string } => Boolean(value) && typeof value === "object" && /^img_[a-z0-9]{1,80}$/.test(String((value as { id?: unknown }).id)) && (value as { url?: unknown }).url === "/img/events/" + (value as { id?: unknown }).id);
      if (result.kind === "saved") setEditing(current => current?.id === targetId ? { ...current, draft: { ...current.draft, imageId: result.data.id } } : current);
      else setFailed(result.message);
    } finally { working.current = false; setUploading(false); }
  }

  if (loadError) {
    return (
      <p className="wr-error" role="alert">
        {loadError}
      </p>
    );
  }
  if (!listing) return <p className="wr-muted">Loading…</p>;

  const today = todayDetroit();
  const upcoming = listing.events.filter((e) => !e.archivedAt && e.date >= today);
  const archived = listing.events.filter(e => e.archivedAt);
  const past = listing.events.filter((e) => !e.archivedAt && e.date < today).reverse();

  return (
    <>
      <div className="wr-head">
        <h1>Events</h1>
        <p className="wr-muted">
          What goes on the events page and the homepage. Save and the site shows it within a few seconds.
        </p>
      </div>

      {listing.backend === "memory" && (
        <p className="wr-warn" role="status">
          <strong>Permanent saving is unavailable.</strong> Contact Glazed Web to connect storage.
          Published sites refuse saves until it is connected. Local demo edits disappear after a restart.
        </p>
      )}

      <details><summary>Recent event changes</summary>{listing.history.length ? <ol>{listing.history.map(entry => <li key={entry.id}>{entry.title}: {entry.action} <time dateTime={entry.changedAt}>{new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.changedAt))}</time></li>)}</ol> : <p className="wr-muted">No change history recorded yet.</p>}</details>
      {failed && !editing && <p className="wr-error" role="alert">{failed} <a href="/workroom" target="_blank" rel="noreferrer">Check latest saved copy ↗</a></p>}
      {note && !editing && (
        <p className="wr-saved" role="status">
          {note}
        </p>
      )}

      {!editing && (
        <div className="wr-save-row" style={{ marginBottom: 18 }}>
          <button className="wr-btn" type="button" onClick={startNew}>
            New event
          </button>
        </div>
      )}

      {editing && (
        <form className="wr-panel" onSubmit={save} noValidate aria-label={!editing.isNew ? "Edit event" : "New event"}>
          <h2 className="wr-h2" style={{ marginTop: 0 }}>
            {!editing.isNew ? "Edit event" : "New event"}
          </h2>
          <fieldset disabled={busy || uploading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-label="Event fields"><div className="wr-form">
            <Field id="title" label="Name" error={errors.title}>
              <input
                id="title"
                type="text"
                value={editing.draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="90's Music Trivia"
                aria-invalid={errors.title ? true : undefined}
              />
            </Field>
            <div className="wr-two">
              <Field id="date" label="Date" error={errors.date}>
                <input id="date" type="date" value={editing.draft.date} onChange={(e) => set("date", e.target.value)} aria-invalid={errors.date ? true : undefined} />
              </Field>
              <Field id="start" label="Starts" error={errors.startTime}>
                <input id="start" type="time" value={editing.draft.startTime} onChange={(e) => set("startTime", e.target.value)} aria-invalid={errors.startTime ? true : undefined} />
              </Field>
              <Field id="end" label="Ends" help="Optional." error={errors.endTime}>
                <input id="end" type="time" value={editing.draft.endTime} onChange={(e) => set("endTime", e.target.value)} aria-invalid={errors.endTime ? true : undefined} />
              </Field>
            </div>
            <div className="wr-two">
              <Field id="price" label="Price line" help="As it should read: $10 per person, Free, $25 a team." error={errors.price}>
                <input id="price" type="text" value={editing.draft.price} onChange={(e) => set("price", e.target.value)} aria-invalid={errors.price ? true : undefined} />
              </Field>
              <Field id="ticket" label="Ticket link" help="The Toast page for the event. Leave blank if tickets are at the door." error={errors.ticketUrl}>
                <input id="ticket" type="url" inputMode="url" value={editing.draft.ticketUrl} onChange={(e) => set("ticketUrl", e.target.value)} placeholder="https://order.toasttab.com/online/copper-pub/item-..." aria-invalid={errors.ticketUrl ? true : undefined} />
              </Field>
            </div>
            <Field id="details" label="Details" help="One per line. Each becomes a bullet on the site." error={errors.details}>
              <textarea id="details" value={editing.draft.details} onChange={(e) => set("details", e.target.value)} placeholder={"Includes a dinner buffet\n6 people max on a team\nHosted upstairs in the Copper Reserve"} aria-invalid={errors.details ? true : undefined} />
            </Field>

            <div className="wr-field">
              <label className="wr-label" htmlFor="photo">Photo or flyer</label>
              <div className="wr-photo">
                {editing.draft.imageId ? (
                  // Plain img on purpose: a just-uploaded photo has no dimensions to give next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/img/events/${editing.draft.imageId}`} alt="" />
                ) : null}
                <div>
                  <input
                    id="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading}
                    onChange={(e) => { const file = e.target.files?.[0]; e.currentTarget.value = ""; void pickPhoto(file); }}
                    aria-describedby="photo-help"
                  />
                  <p className="wr-help" id="photo-help">
                    {uploading ? "Uploading…" : "A portrait flyer looks best. It is resized on your phone before it uploads."}
                  </p>
                  {editing.draft.imageId && (
                    <button type="button" className="wr-link wr-link-danger" onClick={() => set("imageId", "")}>
                      Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>
            {editing.draft.imageId && (
              <Field id="alt" label="What the photo shows" help="One line, for people using a screen reader and for search." error={errors.imageAlt}>
                <input id="alt" type="text" value={editing.draft.imageAlt} onChange={(e) => set("imageAlt", e.target.value)} placeholder="90's Music Trivia flyer with the date and price" aria-invalid={errors.imageAlt ? true : undefined} />
              </Field>
            )}

            <label className="wr-check">
              <input type="checkbox" checked={editing.draft.published} onChange={(e) => set("published", e.target.checked)} />
              On the site
            </label>
          </div></fieldset>

          <div className="wr-save-row">
            <button className="wr-btn" type="submit" disabled={busy || uploading}>
              {busy ? "Saving…" : editing.draft.published ? "Save and publish" : "Save draft"}
            </button>
            <button className="wr-btn wr-btn-ghost" type="button" onClick={() => setEditing(null)} disabled={busy || uploading}>
              Close without saving
            </button>
            {!editing.isNew && (
              <button className="wr-link wr-link-danger" type="button" onClick={remove} disabled={busy || uploading}>
                Archive this event
              </button>
            )}
            {failed && (
              <span className="wr-error" role="alert">
                {failed} <a href="/workroom" target="_blank" rel="noreferrer">Check latest saved copy ↗</a>
              </span>
            )}
          </div>
        </form>
      )}

      <h2 className="wr-h2">Coming up</h2>
      {upcoming.length === 0 ? (
        <div className="wr-empty">
          <h2>Nothing on the books</h2>
          <p>The events page says so too, and points people at Instagram. Add one above and it takes the page over.</p>
        </div>
      ) : (
        <ul className="wr-list">
          {upcoming.map((e) => (
            <EventRow key={e.id} event={e} disabled={busy || uploading || Boolean(editing)} onClick={() => startEdit(e)} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <>
          <button type="button" className="wr-link" onClick={() => setShowPast((v) => !v)} style={{ marginTop: 24 }}>
            {showPast ? "Hide past events" : `Past events (${past.length})`}
          </button>
          {showPast && (
            <ul className="wr-list" style={{ marginTop: 10 }}>
              {past.map((e) => (
                <EventRow key={e.id} event={e} past disabled={busy || uploading || Boolean(editing)} onClick={() => startEdit(e)} />
              ))}
            </ul>
          )}
        </>
      )}

      {archived.length > 0 && <details style={{ marginTop: 24 }}><summary>Archived events ({archived.length})</summary><ul>{archived.map(event => <li key={event.id}>{event.title} <button className="wr-link" type="button" disabled={busy || uploading || Boolean(editing)} onClick={() => mutate("POST", event)}>Restore as draft</button></li>)}</ul></details>}
      <ContactPanel initial={listing.contact} initialRevision={listing.contactRevision} />
    </>
  );
}

function EventRow({ event, past, disabled, onClick }: { event: EditableEvent; past?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <li className="wr-card">
      <button type="button" className="wr-row" onClick={onClick} disabled={disabled}>
        {event.imageId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="wr-thumb" src={`/img/events/${event.imageId}`} alt="" />
        ) : null}
        <span className="wr-row-main">
          <span className="wr-row-name">{event.title || "Untitled"}</span>
          <span className="wr-row-sub">
            {prettyDate(event.date)} · {prettyTime(event.startTime)}
            {event.price ? ` · ${event.price}` : ""}
          </span>
        </span>
        {past ? (
          <span className="wr-chip wr-chip-past">Past</span>
        ) : event.published ? (
          <span className="wr-chip wr-chip-on">On the site</span>
        ) : (
          <span className="wr-chip wr-chip-off">Draft</span>
        )}
      </button>
    </li>
  );
}

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const helpId = error || help ? `${id}-help` : undefined;
  return (
    <div className="wr-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="wr-field-error" id={helpId} role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="wr-help" id={helpId}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

function ContactPanel({ initial, initialRevision }: { initial: EventsContact; initialRevision: string }) {
  const [form, setForm] = useState<EventsContact>(initial);
  const [revision, setRevision] = useState(initialRevision);
  const saving = useRef(false);
  const [errors, setErrors] = useState<Partial<Record<keyof EventsContact, string>>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [failed, setFailed] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (saving.current) return;
    setSaved(""); setFailed(""); const found = contactErrors(form); setErrors(found);
    if (Object.keys(found).length) return;
    saving.current = true; setBusy(true);
    try {
      type SavedContact = { contact: EventsContact; revision: string; backend: "memory" | "postgres" };
      const result = await ownerRequest<SavedContact>("/api/workroom/events/contact", "PUT", { contact: form, revision },
        (value): value is SavedContact => Boolean(value) && typeof value === "object" && isEventsContact((value as SavedContact).contact) && revisionToken((value as SavedContact).revision) && ["memory", "postgres"].includes((value as SavedContact).backend));
      if (result.kind === "saved") { setForm(result.data.contact); setRevision(result.data.revision); setSaved(result.data.backend === "memory" ? "Saved for this local demo session. Changes disappear after a restart." : "Saved."); }
      else { setErrors(result.errors || {}); setFailed(result.message); }
    } finally { saving.current = false; setBusy(false); }
  }

  return (
    <form className="wr-panel" onSubmit={save} noValidate style={{ marginTop: 40 }}>
      <h2 className="wr-h2" style={{ marginTop: 0 }}>
        Who handles events
      </h2>
      <p className="wr-muted" style={{ marginBottom: 14 }}>
        Shown on the events page as the person to ask. Leave it blank and the page shows the bar&apos;s phone instead.
      </p>
      <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} aria-label="Contact fields"><div className="wr-two">
        <Field id="c-name" label="Name" error={errors.name}>
          <input id="c-name" type="text" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setSaved(""); }} />
        </Field>
        <Field id="c-email" label="Email" error={errors.email}>
          <input id="c-email" type="email" inputMode="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setSaved(""); }} />
        </Field>
        <Field id="c-phone" label="Phone" help="Optional." error={errors.phone}>
          <input id="c-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setSaved(""); }} />
        </Field>
      </div></fieldset>
      <div className="wr-save-row">
        <button className="wr-btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="wr-saved" role="status">
            {saved}
          </span>
        )}
        {failed && (
          <span className="wr-error" role="alert">
            {failed} <a href="/workroom" target="_blank" rel="noreferrer">Check latest saved copy ↗</a>
          </span>
        )}
      </div>
    </form>
  );
}
