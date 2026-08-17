// Ordering-window math, computed per request in the bar's own timezone.
//
// glaze.md: route caching and time do not mix. Everything that calls this must
// run per request (the state API is force-dynamic), never at build time, or
// "open now" freezes at whatever moment the site was deployed.

import { ORDERING } from "./config";

type LocalNow = { day: number; minutes: number };

// Intl is the only dependable way to get America/Detroit from a UTC lambda.
// new Date().getHours() on Vercel is UTC and would open the kitchen five hours
// early, every day, silently.
export function localNow(now: Date = new Date()): LocalNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORDERING.timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = days.indexOf(get("weekday"));
  // "24" for midnight is a real Intl output with hour12: false; normalize it.
  const hour = parseInt(get("hour"), 10) % 24;
  const minute = parseInt(get("minute"), 10);
  return { day, minutes: hour * 60 + minute };
}

export type OrderingWindow =
  | { open: true; closesInMinutes: number }
  | { open: false; reason: string };

export function orderingWindow(now: Date = new Date()): OrderingWindow {
  // Demo override, set in Vercel while this is a pitch site: a demo given at
  // 9 AM or after close would otherwise open on "ordering opens at 11:00 AM,"
  // which is the right behavior for guests and the wrong first impression for
  // an owner. Named, documented in .env.example, and on the go-live checklist
  // to remove. Pause and 86 still apply even with this set, so the staff
  // controls stay demonstrable.
  if (process.env.ORDERING_DEMO_ALWAYS_OPEN === "1") {
    return { open: true, closesInMinutes: 60 };
  }
  const { day, minutes } = localNow(now);
  const opens = ORDERING.window.openMinutes[day];
  const last = ORDERING.window.lastOrderMinutes;

  if (minutes < opens) {
    const h = Math.floor(opens / 60);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    return { open: false, reason: `Online ordering opens at ${h12}:${String(opens % 60).padStart(2, "0")} ${ampm}.` };
  }
  if (minutes >= last) {
    return { open: false, reason: "The kitchen is wrapping up for tonight. Online ordering opens again tomorrow." };
  }
  return { open: true, closesInMinutes: last - minutes };
}
