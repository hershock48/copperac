/**
 * What an event is, as the planner writes it, and what makes one valid.
 *
 * CLIENT-SAFE ON PURPOSE: no server-only, no store import. The events screen
 * renders and checks from this file, the save route checks against it again
 * (the route's check is the one that counts), and lib/content.ts turns a row
 * into what the site renders. A field not here cannot be edited from the
 * workroom.
 *
 * Times are the bar's wall clock (America/Detroit). Conversion to an instant
 * happens once, in lib/content.ts, never here.
 */

export type WorkroomEvent = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24 hour */
  startTime: string;
  /** HH:MM, 24 hour, or empty */
  endTime: string;
  /** Free text: "$10 per person", "Free", empty */
  price: string;
  /** Where tickets are sold, usually the Toast page for the event */
  ticketUrl: string;
  /** One line per bullet on the site */
  details: string;
  /** Id of an uploaded photo, or empty */
  imageId: string;
  imageAlt: string;
  /** Off the site until this is on; a draft nobody sees */
  published: boolean;
};

export type EventDraft = Omit<WorkroomEvent, "id" | "createdAt" | "updatedAt">;

/** Who handles events at the bar. Shown on the events page as the way to ask. */
export type EventsContact = { name: string; email: string; phone: string };

export function blankEvent(): EventDraft {
  return {
    title: "",
    date: "",
    startTime: "19:00",
    endTime: "",
    price: "",
    ticketUrl: "",
    details: "",
    imageId: "",
    imageAlt: "",
    published: true,
  };
}

export type EventErrors = Partial<Record<keyof EventDraft, string>>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export function eventErrors(e: EventDraft): EventErrors {
  const errors: EventErrors = {};
  const title = e.title.trim();
  if (title.length < 2) errors.title = "Give it a name.";
  else if (title.length > 80) errors.title = "Keep the name under 80 characters.";

  if (!DATE.test(e.date) || Number.isNaN(Date.parse(`${e.date}T12:00:00Z`))) {
    errors.date = "Pick the date.";
  }
  if (!TIME.test(e.startTime)) errors.startTime = "Pick a start time.";
  if (e.endTime && !TIME.test(e.endTime)) errors.endTime = "That end time does not look right.";
  if (e.endTime && TIME.test(e.startTime) && e.endTime <= e.startTime) {
    errors.endTime = "The end has to come after the start.";
  }
  if (e.price.length > 60) errors.price = "Keep the price line short.";
  if (e.ticketUrl.trim()) {
    let ok = false;
    try {
      const u = new URL(e.ticketUrl.trim());
      ok = u.protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) errors.ticketUrl = "Paste the full ticket link, starting with https://";
  }
  if (e.details.length > 1000) errors.details = "That is a lot of detail. Keep it under 1,000 characters.";
  if (e.imageAlt.length > 200) errors.imageAlt = "Keep the photo description short.";
  if (e.imageId && !e.imageAlt.trim()) errors.imageAlt = "Say what the photo shows, for people who cannot see it.";
  return errors;
}

export function contactErrors(c: EventsContact): Partial<Record<keyof EventsContact, string>> {
  const errors: Partial<Record<keyof EventsContact, string>> = {};
  if (c.name.length > 60) errors.name = "Keep the name short.";
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim())) errors.email = "That email does not look right.";
  if (c.phone && c.phone.replace(/\D/g, "").length < 10) errors.phone = "A phone number needs ten digits.";
  return errors;
}
