"use client";

import { useEffect, useState } from "react";
import {
  blankEvent,
  contactErrors,
  eventErrors,
  type EventDraft,
  type EventErrors,
  type EventsContact,
  type WorkroomEvent,
} from "@/lib/workroom/events-def";
import { resizeToJpegDataUrl } from "./resize";

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

type Listing = { events: WorkroomEvent[]; contact: EventsContact; backend: "postgres" | "memory" };
type Editing = { id: string | null; draft: EventDraft };

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workroom/events", { headers: { Accept: "application/json" } });
        const data = (await res.json().catch(() => ({}))) as Partial<Listing> & { error?: string };
        if (!res.ok || !data.events) {
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
    setEditing({ id: null, draft: blankEvent() });
    setErrors({});
    setNote("");
    setFailed("");
  }

  function startEdit(e: WorkroomEvent) {
    const { id, createdAt, updatedAt, ...draft } = e;
    void createdAt;
    void updatedAt;
    setEditing({ id, draft });
    setErrors({});
    setNote("");
    setFailed("");
  }

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    if (!editing) return;
    setEditing({ ...editing, draft: { ...editing.draft, [key]: value } });
    setNote("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFailed("");
    const found = eventErrors(editing.draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFailed("Check the marked boxes.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/workroom/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: { ...editing.draft, id: editing.id ?? undefined } }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Listing> & { error?: string; errors?: EventErrors };
      if (res.ok && data.events) {
        setListing(data as Listing);
        setEditing(null);
        setNote(editing.draft.published ? "Saved. The site shows it within a few seconds." : "Saved as a draft. It is not on the site.");
      } else if (data.errors) {
        setErrors(data.errors);
        setFailed(data.error || "Check the marked boxes.");
      } else {
        setFailed(data.error || "That did not save. Your typing is still on screen.");
      }
    } catch {
      setFailed("That did not save. Your typing is still on screen.");
    }
    setBusy(false);
  }

  async function remove() {
    if (!editing?.id) return;
    if (!window.confirm("Take this event off the site and delete it?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workroom/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Listing> & { error?: string };
      if (res.ok && data.events) {
        setListing(data as Listing);
        setEditing(null);
        setNote("Deleted.");
      } else {
        setFailed(data.error || "That did not delete.");
      }
    } catch {
      setFailed("Could not reach the site.");
    }
    setBusy(false);
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || !editing) return;
    setUploading(true);
    setFailed("");
    try {
      const dataUrl = await resizeToJpegDataUrl(file);
      const res = await fetch("/api/workroom/events/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && data.id) set("imageId", data.id);
      else setFailed(data.error || "That photo did not upload.");
    } catch {
      setFailed("That photo could not be read. Try a JPEG or PNG.");
    }
    setUploading(false);
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
  const upcoming = listing.events.filter((e) => e.date >= today);
  const past = listing.events.filter((e) => e.date < today).reverse();

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
          <strong>No database is connected yet</strong>, so anything saved here is held only in memory and can be
          forgotten by the next restart. Connect a database in Vercel (Storage, then Neon) and this warning goes away.
        </p>
      )}

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
        <form className="wr-panel" onSubmit={save} noValidate aria-label={editing.id ? "Edit event" : "New event"}>
          <h2 className="wr-h2" style={{ marginTop: 0 }}>
            {editing.id ? "Edit event" : "New event"}
          </h2>
          <div className="wr-form">
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
              <span className="wr-label">Photo or flyer</span>
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
                    onChange={(e) => pickPhoto(e.target.files?.[0])}
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
          </div>

          <div className="wr-save-row">
            <button className="wr-btn" type="submit" disabled={busy || uploading}>
              {busy ? "Saving…" : "Save and publish"}
            </button>
            <button className="wr-btn wr-btn-ghost" type="button" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
            {editing.id && (
              <button className="wr-link wr-link-danger" type="button" onClick={remove} disabled={busy}>
                Delete this event
              </button>
            )}
            {failed && (
              <span className="wr-error" role="alert">
                {failed}
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
            <EventRow key={e.id} event={e} onClick={() => startEdit(e)} />
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
                <EventRow key={e.id} event={e} past onClick={() => startEdit(e)} />
              ))}
            </ul>
          )}
        </>
      )}

      <ContactPanel initial={listing.contact} />
    </>
  );
}

function EventRow({ event, past, onClick }: { event: WorkroomEvent; past?: boolean; onClick: () => void }) {
  return (
    <li className="wr-card">
      <button type="button" className="wr-row" onClick={onClick}>
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

function ContactPanel({ initial }: { initial: EventsContact }) {
  const [form, setForm] = useState<EventsContact>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof EventsContact, string>>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [failed, setFailed] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved("");
    setFailed("");
    const found = contactErrors(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workroom/events/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: form }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; errors?: typeof errors };
      if (res.ok && data.ok) setSaved("Saved.");
      else if (data.errors) setErrors(data.errors);
      else setFailed(data.error || "That did not save.");
    } catch {
      setFailed("Could not reach the site.");
    }
    setBusy(false);
  }

  return (
    <form className="wr-panel" onSubmit={save} noValidate style={{ marginTop: 40 }}>
      <h2 className="wr-h2" style={{ marginTop: 0 }}>
        Who handles events
      </h2>
      <p className="wr-muted" style={{ marginBottom: 14 }}>
        Shown on the events page as the person to ask. Leave it blank and the page shows the bar&apos;s phone instead.
      </p>
      <div className="wr-two">
        <Field id="c-name" label="Name" error={errors.name}>
          <input id="c-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field id="c-email" label="Email" error={errors.email}>
          <input id="c-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field id="c-phone" label="Phone" help="Optional." error={errors.phone}>
          <input id="c-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
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
            {failed}
          </span>
        )}
      </div>
    </form>
  );
}
