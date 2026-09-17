import "server-only";
import { getStore } from "./store";
import { contentRevision } from "./content-cas";
import { EVENTS_CONTACT_KEY } from "@/lib/content";
import type { WorkroomEvent, EditableEvent, EventsListing, EventHistory } from "./events-def";

export const editableEvent = (event: WorkroomEvent): EditableEvent => ({ ...event, revision: contentRevision(event) });
export async function eventListing(): Promise<EventsListing> {
  const store = getStore();
  const [events, rawContact, history] = await Promise.all([store.events.list(), store.getValue(EVENTS_CONTACT_KEY), store.eventHistory()]);
  // Derive the displayed contact from the same snapshot as its revision.
  const raw = rawContact as Partial<{ name: string; email: string; phone: string }> | null;
  const contact = { name: typeof raw?.name === "string" ? raw.name : "", email: typeof raw?.email === "string" ? raw.email : "", phone: typeof raw?.phone === "string" ? raw.phone : "" };
  const recent: EventHistory[] = history.map(entry => {
    const before = entry.before as WorkroomEvent | null, after = entry.after as WorkroomEvent | null;
    return { id: entry.id, changedAt: entry.changedAt, title: after?.title || before?.title || "Event", action: after?.archivedAt ? "archived" : before?.archivedAt ? "restored" : "saved" };
  });
  return { events: events.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).map(editableEvent), contact, contactRevision: contentRevision(rawContact), backend: store.backend, history: recent };
}
