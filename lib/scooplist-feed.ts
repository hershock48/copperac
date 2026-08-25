import "server-only";

/**
 * The Scooplist feed client: the site-side half of a live board.
 *
 * Copy this file into the client repo (lib/scooplist-feed.ts) the way the
 * glazed credit is copied, never imported across repos. Then write ONE
 * small consumer module next to it (the site's own types, mappers, and
 * static fallbacks) and render from that. copperac/lib/taplist.ts is the
 * reference consumer; truenorth/src/data/liveCase.ts and
 * cascarellis/src/data/liveBar.ts are the field ancestors this generalizes.
 *
 * The rules this file encodes, each learned on a live site:
 *
 *  - THE FEED IS AN ENHANCEMENT, NEVER A DEPENDENCY (truenorth's words).
 *    One fetch, short revalidate, hard timeout; any failure at all returns
 *    every section's static fallback with live=false. A menu that
 *    sometimes 500s is worse than one that is occasionally a day stale.
 *  - MISCONFIG BEATS PARTIAL TRUTH (cascarellis' words). If any row in a
 *    board fails to map, the WHOLE section falls back: a half-rendered
 *    wine list with confident prices on it is a lie with good posture.
 *    Sections are independent, so a malformed cocktail row cannot take
 *    the tap list down with it.
 *  - THE SITE OWNS SECTION IDENTITY, THE FEED OWNS ROWS. Titles, order,
 *    and voice stay in the site's static file; the feed only ever fills
 *    rows in. Empty and missing boards are indistinguishable (the feed
 *    filters empty boards server-side) and both mean fallback.
 *  - THE FEED URL IS A CODE DEFAULT, env-overridable. It is the client's
 *    own infrastructure URL, a public fact like their phone number, and
 *    requiring a dashboard step to turn the feature on once left a site
 *    silently running on its snapshot with nothing saying so.
 */

export type FeedSize = { label: string; price: string };

export type FeedFlavor = {
  id: string;
  name: string;
  description: string;
  producer: string;
  abv: string;
  allergens: string[];
  tags: string[];
  photoUrl: string;
  sizes: FeedSize[];
  inCaseSince: number | null;
  low: boolean;
  position: number | null;
};

export type FeedBoard = { key: string; label: string; flavors: FeedFlavor[] };

export type Feed = {
  location: { id: string; name: string };
  updatedAt: number | null;
  boards: FeedBoard[];
  onDeck: FeedFlavor[];
};

export type SectionSpec<T> = {
  /** The org's category key in the feed (the CATEGORY CONTRACT). */
  board: string;
  /** Map one feed row to the site's own shape; null rejects the ROW,
      which rejects the whole SECTION (misconfig beats partial truth). */
  map: (f: FeedFlavor) => T | null;
  /** What renders when the section is not live. */
  fallback: T[];
};

export type FeedConfig = {
  /** Code default, a public fact; SCOOPLIST_FEED_URL still overrides. */
  baseUrl: string;
  /** Set on multi-org deployments: /api/v1/orgs/{org}/case/{location}.
      Omit for a single-tenant install: /api/v1/case/{location}. */
  org?: string;
  location: string;
  /** Seconds between refetches; default 60, matching the feed's own edge cache. */
  revalidate?: number;
  /** Hard cap on one fetch; default 3000ms. A dead feed costs one of
      these per revalidate window, then the page is instant again. */
  timeoutMs?: number;
};

export type CaseResult<S extends Record<string, SectionSpec<unknown>>> = {
  sections: { [K in keyof S]: S[K] extends SectionSpec<infer T> ? T[] : never };
  live: { [K in keyof S]: boolean };
  /** Raw on-deck rows; map them only when the board they preview is live. */
  onDeck: FeedFlavor[];
  updatedAt: number | null;
};

/** All rows must map or the section is not trusted. */
function mapAll<T>(rows: FeedFlavor[], map: (f: FeedFlavor) => T | null): T[] | null {
  if (rows.length === 0) return null;
  const out: T[] = [];
  for (const row of rows) {
    const mapped = map(row);
    if (mapped === null) return null;
    out.push(mapped);
  }
  return out;
}

export async function fetchScooplistCase<S extends Record<string, SectionSpec<unknown>>>(
  config: FeedConfig,
  sections: S,
): Promise<CaseResult<S>> {
  const fallbackResult = (): CaseResult<S> => {
    const out = { sections: {}, live: {}, onDeck: [], updatedAt: null } as unknown as {
      sections: Record<string, unknown[]>;
      live: Record<string, boolean>;
      onDeck: FeedFlavor[];
      updatedAt: number | null;
    };
    for (const [name, spec] of Object.entries(sections)) {
      out.sections[name] = spec.fallback;
      out.live[name] = false;
    }
    return out as CaseResult<S>;
  };

  const base = (process.env.SCOOPLIST_FEED_URL || config.baseUrl).replace(/\/$/, "");
  const path = config.org
    ? `/api/v1/orgs/${config.org}/case/${config.location}`
    : `/api/v1/case/${config.location}`;

  let feed: Feed;
  try {
    const res = await fetch(`${base}${path}`, {
      next: { revalidate: config.revalidate ?? 60 },
      signal: AbortSignal.timeout(config.timeoutMs ?? 3000),
    });
    if (!res.ok) return fallbackResult();
    feed = (await res.json()) as Feed;
  } catch {
    return fallbackResult();
  }

  const result = fallbackResult() as unknown as {
    sections: Record<string, unknown[]>;
    live: Record<string, boolean>;
    onDeck: FeedFlavor[];
    updatedAt: number | null;
  };
  for (const [name, spec] of Object.entries(sections)) {
    const rows = feed.boards.find((b) => b.key === spec.board)?.flavors ?? [];
    const mapped = mapAll(rows, spec.map);
    if (mapped !== null) {
      result.sections[name] = mapped;
      result.live[name] = true;
    }
  }
  result.onDeck = Array.isArray(feed.onDeck) ? feed.onDeck : [];
  result.updatedAt = typeof feed.updatedAt === "number" ? feed.updatedAt : null;
  return result as CaseResult<S>;
}
