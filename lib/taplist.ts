import "server-only";

import { fetchScooplistCase, type FeedFlavor } from "./scooplist-feed";
import { COCKTAILS, type MenuItem } from "./menu";

/**
 * The live bar program, fed by the bar's own Scooplist org. The bar edits
 * taps and cocktails at scooplist.glazedweb.com/case; this module is how
 * the site renders whatever they saved, and how it stays honest when the
 * feed cannot answer.
 *
 * CATEGORY CONTRACT with the copperac org (tools/populate-scooplist.mjs
 * and the org-creation command carry the same list; a key missing on the
 * deployment silently coerces categories, which is why the populate
 * script hard-exits on a coerced save):
 *
 *   taps:On Tap
 *   cocktails:Cocktails
 *
 * Fallbacks, per section, and why they differ:
 *  - Taps have NO static fallback on purpose. This repo never carried a
 *    tap list ("No invented tap list, because the taps rotate" was the
 *    menu page's own rule) and a guessed one would be worse than none.
 *    When taps are not live the menu renders exactly the panel it always
 *    has: "Taps rotate. Ask what's pouring."
 *  - Cocktails fall back to the COCKTAILS section in lib/menu.ts, the
 *    printed-menu snapshot the page rendered before the feed existed.
 */

const ORG = "copperac";
const LOCATION = "marshall";

/*
  Code default, env-overridable, the cascarellis rule: the feed URL is the
  client's own infrastructure, a public fact like their phone number, and
  requiring a dashboard step to turn the feature on once left a site
  silently running on its snapshot with nothing saying so. Until the
  copperac org exists on the deployment the fetch 404s fast and every
  section falls back, which renders today's page exactly.
  SCOOPLIST_FEED_URL overrides for local testing against a local
  Scooplist.

  scooplist.glazedweb.com is the multi-org deployment (Kevin's call,
  August 2026: the product's domain belongs to the product; True North,
  who used to hold it single-tenant, became its first org).
*/
const DEFAULT_FEED = "https://scooplist.glazedweb.com";

export type Tap = {
  name: string;
  /** Optional: a bar types "Bell's Two Hearted" at the counter and moves on. */
  brewery?: string;
  /** One line about the beer, from the drink's description in Scooplist. */
  desc?: string;
  /** Normalized to carry the sign: "5.2%". */
  abv?: string;
  /** First listed price as "7.00", matching MenuList's price() input. */
  price?: string;
  /** The "local" tag, same convention as the Cascarelli's install. */
  local: boolean;
  /** Running low: the keg is close to kicking, say so before it does. */
  low: boolean;
};

export type DrinksData = {
  taps: Tap[];
  onDeck: Tap[];
  cocktails: MenuItem[];
  live: { taps: boolean; cocktails: boolean };
  updatedAt: number | null;
};

/** "$7" / "7" / "$7.50" from the feed to MenuList's "7.00" shape; null
    when there is no finite positive number in it. */
function dollars(raw: string | undefined): string | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** A tap needs a name and nothing else. The first version also demanded a
    brewery and rejected the row without one, and one rejected row falls
    the whole section back, so the first two taps the bar ever entered
    ("Bell's Two Hearted", "M-43", no producer filled in) vanished from the
    site with nothing saying why (2 Sep 2026). A name-only tap is an honest
    tap; the brewery is detail, shown when the bar bothers to add it. */
function toTap(f: FeedFlavor): Tap | null {
  if (!f.name.trim()) return null;
  const abv = f.abv.trim();
  const brewery = f.producer.trim();
  return {
    name: f.name,
    brewery: brewery || undefined,
    desc: f.description.trim() || undefined,
    abv: abv ? (abv.endsWith("%") ? abv : `${abv}%`) : undefined,
    price: dollars(f.sizes[0]?.price) ?? undefined,
    local: f.tags.some((t) => t.toLowerCase() === "local"),
    low: f.low,
  };
}

/** Cocktails on this menu always show a price; a row without one cannot
    render honestly, so it rejects and the section falls back. */
function toCocktail(f: FeedFlavor): MenuItem | null {
  const price = dollars(f.sizes[0]?.price);
  if (!f.name.trim() || price === null) return null;
  return { name: f.name, desc: f.description, price };
}

export async function getDrinks(): Promise<DrinksData> {
  const result = await fetchScooplistCase(
    { baseUrl: DEFAULT_FEED, org: ORG, location: LOCATION },
    {
      taps: { board: "taps", map: toTap, fallback: [] as Tap[] },
      cocktails: { board: "cocktails", map: toCocktail, fallback: COCKTAILS.items },
    },
  );

  /*
    On deck renders only while taps are live, and unmappable rows drop
    instead of felling anything: it is a preview, not a menu, so partial
    truth is acceptable there in a way it is not above.
  */
  const onDeck = result.live.taps
    ? result.onDeck.map(toTap).filter((t): t is Tap => t !== null)
    : [];

  return {
    taps: result.sections.taps,
    onDeck,
    cocktails: result.sections.cocktails,
    live: result.live,
    updatedAt: result.updatedAt,
  };
}
