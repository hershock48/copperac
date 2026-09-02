import type { Metadata } from "next";
import MenuList from "@/components/MenuList";
import TapList from "@/components/TapList";
import { Button, Eyebrow, Heading, PageHero, Section } from "@/components/ui";
import { getDrinks } from "@/lib/taplist";
import { SITE } from "@/lib/site";
import { jsonLd } from "@/lib/jsonld";

/**
 * What's pouring, on its own page. The owner asked for a tab in the header
 * (Kevin, 2 Sep 2026), and the bar had just put all sixteen handles into
 * Scooplist, which is the condition the README set for building it: the
 * board is kept, so it earns a page.
 *
 * Same source and same rule as the menu page's bar area: the list renders
 * from the bar's Scooplist board (lib/taplist.ts), and when the feed is down
 * or empty the page says taps rotate and points at the bar rather than
 * showing a guess. Cocktails below, live from the same board, printed list
 * as the fallback.
 */

// The feed re-reads every minute, so a kicked keg is off this page within
// one, the same cadence as the menu page.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "On Tap",
  description:
    "What is pouring right now at Copper Athletic Club in Marshall, MI: sixteen taps, Michigan beer, the cocktail list. Updated by the bar as the kegs change.",
  alternates: { canonical: "/taps" },
  openGraph: {
    url: "/taps",
    type: "website",
    siteName: "Copper Athletic Club",
    title: "On Tap | Copper Athletic Club",
    description: "What is pouring right now at Copper Athletic Club in Marshall, MI. Updated by the bar as the kegs change.",
    images: [{ url: "/og/menu.jpg", width: 1200, height: 630, alt: "Copper Athletic Club: cold taps and the cocktail list in downtown Marshall" }],
  },
};

export default async function TapsPage() {
  const drinks = await getDrinks();
  const tapsLive = drinks.live.taps && drinks.taps.length > 0;

  const schema = tapsLive
    ? {
        "@context": "https://schema.org",
        "@type": "Menu",
        name: "Copper Athletic Club, On Tap",
        url: `${SITE.url}/taps`,
        hasMenuSection: [
          {
            "@type": "MenuSection",
            name: "On Tap",
            hasMenuItem: drinks.taps.map((t) => ({
              "@type": "MenuItem",
              name: t.name,
              ...(t.brewery ? { description: t.brewery } : {}),
              ...(t.price ? { offers: { "@type": "Offer", price: t.price, priceCurrency: "USD" } } : {}),
            })),
          },
          {
            "@type": "MenuSection",
            name: "Cocktails",
            hasMenuItem: drinks.cocktails.map((c) => ({
              "@type": "MenuItem",
              name: c.name,
              ...(c.desc ? { description: c.desc } : {}),
              ...(c.price ? { offers: { "@type": "Offer", price: c.price, priceCurrency: "USD" } } : {}),
            })),
          },
        ],
      }
    : null;

  return (
    <>
      <PageHero
        title="On Tap"
        subtitle={
          tapsLive
            ? `${drinks.taps.length} handles, kept current by the bar. When a keg kicks, it comes off this page.`
            : "Taps rotate. The bar keeps the board; ask what is pouring tonight."
        }
        image="/img/taps.webp"
        imageAlt="A row of tap handles along the copper bar at Copper Athletic Club"
      />

      <Section>
        {tapsLive ? (
          <TapList taps={drinks.taps} onDeck={drinks.onDeck} updatedAt={drinks.updatedAt} />
        ) : (
          <div className="rounded-sm border border-ink-line p-12 text-center">
            <Eyebrow>Right now</Eyebrow>
            <Heading className="mt-5">Ask what&rsquo;s pouring</Heading>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-cream-dim">
              The board is between updates. Sixteen handles, a good share of them Michigan, and the bartender knows
              every one.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-4 sm:flex-row">
              <Button href={SITE.phoneHref}>Call {SITE.phone}</Button>
              <Button href="/menu" variant="outline">
                See the menu
              </Button>
            </div>
          </div>
        )}

        <div className="mt-20">
          <MenuList sections={[{ name: "Cocktails", items: drinks.cocktails }]} />
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <Button href="/menu" variant="outline">
            The full menu
          </Button>
          <Button href={SITE.orderUrl}>Order Online</Button>
        </div>
      </Section>

      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />}
    </>
  );
}
