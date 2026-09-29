/** Shared event/contact fields. Client-safe; persistence and access stay in the client application. */
export type EventDraft = {
  title: string; date: string; startTime: string; endTime: string; price: string;
  ticketUrl: string; details: string; imageId: string; imageAlt: string; published: boolean;
};
export type WorkroomEvent = EventDraft & { id: string; createdAt: number; updatedAt: number; archivedAt?: number };
export type EditableEvent = WorkroomEvent & { revision: string };
export type EventsContact = { name: string; email: string; phone: string };
export type EventErrors = Partial<Record<keyof EventDraft, string>>;
export type EventHistory = { id: string; changedAt: string; title: string; action: "saved" | "archived" | "restored" };
export type EventsListing = { events: EditableEvent[]; contact: EventsContact; contactRevision: string; backend: "postgres" | "memory"; history: EventHistory[] };
export const eventId = (value: unknown): value is string => typeof value === "string" && /^evt_[a-z0-9]{1,80}$/.test(value);
export const revisionToken = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function blankEvent(): EventDraft { return { title: "", date: "", startTime: "19:00", endTime: "", price: "", ticketUrl: "", details: "", imageId: "", imageAlt: "", published: true }; }
const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T12:00:00Z")) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
const timeValid = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
function localTimeExists(date: string, time: string): boolean {
  return ["-04:00", "-05:00"].some(offset => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(date + "T" + time + ":00" + offset));
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    return part("year") + "-" + part("month") + "-" + part("day") + "T" + part("hour") + ":" + part("minute") === date + "T" + time;
  });
}
export function eventErrors(e: EventDraft): EventErrors {
  const errors: EventErrors = {};
  if (e.title.trim().length < 2) errors.title = "Give it a name.";
  else if (e.title.length > 80) errors.title = "Keep the name under 80 characters.";
  if (!dateValid(e.date)) errors.date = "Pick a valid calendar date.";
  if (!timeValid(e.startTime)) errors.startTime = "Pick a valid start time.";
  if (e.endTime && !timeValid(e.endTime)) errors.endTime = "Pick a valid end time.";
  if (e.endTime && timeValid(e.startTime) && timeValid(e.endTime) && e.endTime <= e.startTime) errors.endTime = "The end must come after the start on the same date.";
  if (dateValid(e.date) && timeValid(e.startTime) && !localTimeExists(e.date, e.startTime)) errors.startTime = "That local time does not occur on this date. Choose another time.";
  if (e.endTime && dateValid(e.date) && timeValid(e.endTime) && !localTimeExists(e.date, e.endTime)) errors.endTime = "That local time does not occur on this date. Choose another time.";
  if (e.price.length > 60) errors.price = "Keep the price line under 60 characters.";
  if (e.ticketUrl.length > 500) errors.ticketUrl = "Keep the ticket link under 500 characters.";
  else if (e.ticketUrl.trim()) {
    try { const url = new URL(e.ticketUrl.trim()); if (url.protocol !== "https:" || url.username || url.password) errors.ticketUrl = "Use a full https:// ticket link."; }
    catch { errors.ticketUrl = "Use a full https:// ticket link."; }
  }
  if (e.details.length > 1000) errors.details = "Keep details under 1,000 characters.";
  if (e.imageId && !/^img_[a-z0-9]{1,80}$/.test(e.imageId)) errors.imageId = "Add the photo again.";
  if (e.imageAlt.length > 200) errors.imageAlt = "Keep the photo description under 200 characters.";
  if (e.imageId && !e.imageAlt.trim()) errors.imageAlt = "Say what the photo shows, for people who cannot see it.";
  return errors;
}
export function contactErrors(c: EventsContact): Partial<Record<keyof EventsContact, string>> {
  const errors: Partial<Record<keyof EventsContact, string>> = {};
  if (c.name.length > 60) errors.name = "Keep the name under 60 characters.";
  if (c.email.length > 120 || (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim()))) errors.email = "Enter a valid email under 120 characters.";
  if (c.phone.length > 25 || (c.phone && c.phone.replace(/\D/g, "").length < 10)) errors.phone = "Enter a phone number with at least ten digits and under 25 characters.";
  return errors;
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const stringKeys = ["title", "date", "startTime", "endTime", "price", "ticketUrl", "details", "imageId", "imageAlt"] as const;
export function parseEventDraft(raw: unknown): { draft: EventDraft; errors: EventErrors } | null {
  if (!object(raw) || stringKeys.some(key => typeof raw[key] !== "string") || typeof raw.published !== "boolean") return null;
  const draft = Object.fromEntries(stringKeys.map(key => [key, (raw[key] as string).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").replace(/\r\n?/g, "\n").trim()])) as Omit<EventDraft, "published">;
  draft.title = draft.title.replace(/\n/g, " "); draft.price = draft.price.replace(/\n/g, " "); draft.imageAlt = draft.imageAlt.replace(/\n/g, " ");
  const complete = { ...draft, published: raw.published };
  return { draft: complete, errors: eventErrors(complete) };
}
export function parseEventsContact(raw: unknown): { contact: EventsContact; errors: Partial<Record<keyof EventsContact, string>> } | null {
  if (!isEventsContact(raw)) return null;
  const contact = Object.fromEntries(Object.entries(raw).filter(([key]) => ["name", "email", "phone"].includes(key)).map(([key, value]) => [key, value.replace(/[\x00-\x1f\x7f]/g, " ").trim()])) as EventsContact;
  return { contact, errors: contactErrors(contact) };
}
export function isEventsContact(value: unknown): value is EventsContact { return object(value) && ["name", "email", "phone"].every(key => typeof value[key] === "string"); }
export function isEditableEvent(value: unknown): value is EditableEvent {
  return object(value) && eventId(value.id) && revisionToken(value.revision) && stringKeys.every(key => typeof value[key] === "string") && typeof value.published === "boolean" && Number.isFinite(value.createdAt) && Number.isFinite(value.updatedAt) && (value.archivedAt === undefined || Number.isFinite(value.archivedAt));
}
export function isEventsListing(value: unknown): value is EventsListing {
  if (!object(value) || !["postgres", "memory"].includes(String(value.backend)) || !Array.isArray(value.events) || !value.events.every(isEditableEvent) || !isEventsContact(value.contact) || !revisionToken(value.contactRevision) || !Array.isArray(value.history)) return false;
  if (new Set(value.events.map(e => e.id)).size !== value.events.length) return false;
  return value.history.every(e => object(e) && typeof e.id === "string" && typeof e.title === "string" && ["saved", "archived", "restored"].includes(String(e.action)) && typeof e.changedAt === "string" && Number.isFinite(Date.parse(e.changedAt)));
}
