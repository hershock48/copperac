export const SITE = {
  name: "Copper Athletic Club",
  shortName: "Copper AC",
  // Still the tagline of record: it carries "sports bar" for search and link
  // previews, and it is in the manifest and the page titles. It is no longer
  // the hero h1, which now runs the deadpan spec version of the same joke.
  tagline: "A sports bar. Not a gym.",
  // Confirmed by Kevin, 9 Aug 2026: seven in the main bar, four upstairs in the
  // Copper Reserve, eleven in the building. It took three passes to land here
  // (14 was mine and invented, then 9, then 7 plus 4), which is the whole
  // argument for these being constants and not typed into copy.
  //
  // Nothing published states any of it. copperac.com says only "TVs
  // broadcasting the big game" with no number, and it is in neither their
  // Google nor their Yelp listing, so it can only come from someone standing in
  // the room and there is no source to re-check it against. If the bar
  // renovates, nothing will tell us these went stale.
  //
  // tvCountMain and tvCountTotal are gone. tvCountMain fed the homepage h1
  // ("7 TVs. 0 treadmills.") and that line is retired at the owner's request;
  // tvCountTotal never had a consumer. Both were counts nobody could re-check,
  // so leaving them sitting here unused was an invitation to publish an
  // unverified number somewhere new. tvCountReserve stays because four pages
  // quote it and the private room is a countable, askable thing.
  // HOW THE SCREENS RUN, confirmed by Kevin 10 Aug 2026: both, depending on the night.
  // Several games up on an ordinary night and staff will put a customer's game on; when
  // Detroit has a marquee game it takes every screen. The hero deliberately says neither --
  // "every screen dedicated to sports" is Kevin's line and it is about sports rather than
  // not-sports, which is the claim that is true on every night of the year.
  tvCountReserve: 4,
  url: "https://copperac.com",
  phone: "(269) 558-8222",
  phoneHref: "tel:+12695588222",
  // Confirmed by the owner, 21 Aug 2026: reserve@copperac.com is the club's
  // monitored inbox (replaces the info@ placeholder that was never confirmed).
  // This is both the address the enquiry form's mailto fallback writes to and
  // the default for INQUIRY_TO. Delivery via Resend is still unconfigured —
  // see README, "The enquiry form does not reach an inbox yet".
  email: "reserve@copperac.com",
  street: "133 W. Michigan Ave.",
  city: "Marshall",
  state: "MI",
  zip: "49068",
  mapUrl:
    "https://www.google.com/maps/dir/?api=1&destination=133+W+Michigan+Ave,+Marshall,+MI+49068",
  // Ordering is Toast's, for now: Kevin's call when he took the site (Aug
  // 2026) — he keeps Toast online ordering and likes the rest. This is the
  // same store the old site links: copperac.com's nav points at
  // www.toasttab.com/copper-pub/v3, which 301s to this URL (verified 21 Aug
  // 2026). Every "Order Online" surface reads this constant. The in-house
  // ordering Glazed Web built ("we replace toast online" was the earlier
  // call, since reversed) stays intact at /order but parked behind a
  // redirect to this same store — see next.config.ts. Switching to the
  // in-house channel is this line back to "/order", that redirect deleted,
  // and /order restored to app/sitemap.ts.
  orderUrl: "https://order.toasttab.com/online/copper-pub",
  instagram: "https://www.instagram.com/copper_ac/",
  facebook: "https://www.facebook.com/TheCopperAC",
  geo: { lat: 42.2717, lng: -84.9636 },
} as const;

export const HOURS = [
  { label: "Monday – Saturday", value: "11:00 AM – 12:00 AM" },
  { label: "Sunday", value: "9:00 AM – 12:00 AM" },
  { label: "Sunday Brunch", value: "9:00 AM – 2:00 PM" },
];

// Confirmed by the owner (Aug 2026): kitchen closes at 10 PM, the bar stays
// open until midnight. Kept as its own field on purpose, because the live site
// lists only the venue hours and never mentions the kitchen, so a guest reads
// midnight while Toast separately shows a 10 PM cutoff.
export const KITCHEN_NOTE = "Kitchen closes at 10:00 PM daily.";

export const CONSUMER_ADVISORY =
  "Consuming raw or undercooked meats, poultry, seafood, shellfish or eggs may increase your risk of foodborne illness, especially if you have certain medical conditions.";

export const ACCESSIBILITY_NOTE =
  "The main floor bar and dining room are street-level accessible. The Copper Reserve is on the second floor and is not currently wheelchair accessible. Call us and we will do everything we can to accommodate your group downstairs.";

export type CACEvent = {
  slug: string;
  title: string;
  date: string; // ISO
  displayDate: string;
  time: string;
  price?: string;
  ticketUrl?: string;
  image?: string;
  imageAlt?: string;
  details: string[];
};

export const EVENTS: CACEvent[] = [
  {
    slug: "90s-music-trivia",
    title: "90's Music Trivia",
    date: "2026-08-20T19:00:00-04:00",
    displayDate: "Thursday, August 20",
    time: "7:00 – 9:00 PM",
    price: "$10 per person",
    ticketUrl:
      "https://order.toasttab.com/online/copper-pub/item-90s-music-trivia_4b1b005d-90e6-49bf-8ba6-8283d85869b4",
    image: "/img/event-trivia.webp",
    imageAlt:
      "90's Music Trivia flyer styled like a Windows 95 Paint window, surrounded by 90s pop culture icons",
    details: [
      "Includes a dinner buffet",
      "6 people max on a team",
      "Themed prizes for the winners",
      "Hosted upstairs in the Copper Reserve",
    ],
  },
];

export const NAV = [
  { href: "/menu", label: "Menu" },
  { href: "/brunch", label: "Brunch" },
  { href: "/reserve", label: "The Copper Reserve" },
  { href: "/events", label: "Events" },
  { href: "/contact", label: "Contact" },
];

/**
 * Events that have not finished yet, soonest first.
 *
 * Everything that renders an event has to come through here. Reading EVENTS[0]
 * directly is how a site ends up advertising last month's trivia night: array
 * order is not a promise about dates, and nothing takes an event down once it
 * is over. The grace window keeps an event listed while it is still happening.
 *
 * Any page calling this must also `export const revalidate`, or the cutoff is
 * frozen at whatever moment the site was last built.
 */
const EVENT_GRACE_MS = 4 * 60 * 60 * 1000;

export function upcomingEvents(now: Date = new Date()): CACEvent[] {
  const cutoff = now.getTime() - EVENT_GRACE_MS;
  return EVENTS.filter((e) => new Date(e.date).getTime() >= cutoff).sort(
    (a, b) => +new Date(a.date) - +new Date(b.date)
  );
}
