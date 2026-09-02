import type { Metadata } from "next";
import MenuList from "@/components/MenuList";
import TapList from "@/components/TapList";
import { Button, PageHero, Section } from "@/components/ui";
import { COCKTAILS, FOOD_MENU, type MenuSection } from "@/lib/menu";
import { getDrinks } from "@/lib/taplist";
import { CONSUMER_ADVISORY, KITCHEN_NOTE, SITE } from "@/lib/site";
import { jsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Burgers, wings, coneys, Detroit-style loose burgers, tacos, salads and more at Copper Athletic Club in Marshall, MI. Order online or dine in.",
  alternates: { canonical: "/menu" },
  openGraph: {
    // Next replaces the layout's openGraph object rather than merging it,
    // so url, type and siteName have to be restated on every page.
    url: "/menu",
    type: "website",
    siteName: "Copper Athletic Club",
    title: "Menu | Copper Athletic Club",
    description:
      "Burgers, wings, coneys, Detroit-style loose burgers, tacos, salads and more in downtown Marshall, MI.",
    images: [{ url: "/og/menu.jpg", width: 1200, height: 630, alt: "Copper Athletic Club menu: burgers, coneys, wings and cold taps" }],
  },
};

export default async function MenuPage() {
  /*
    The drinks resolve live from the bar's Scooplist org (lib/taplist.ts),
    with the static data as the per-section fallback. The page rides the
    fetch's own 60s revalidate; a dead feed costs one 3s render per
    minute, then the page is instant again and identical to the pre-feed
    version.
  */
  const drinks = await getDrinks();

  // Cocktails render from the resolved rows (live or fallback, the render
  // cannot tell, which is the point); the static file keeps owning the
  // section's name and position.
  const sections: MenuSection[] = FOOD_MENU.map((s) =>
    s === COCKTAILS ? { name: s.name, items: drinks.cocktails } : s,
  );

  /*
    Built from the RESOLVED sections, inside the component, so the
    structured data can never disagree with the visible page (the old
    module-level constant would have kept advertising the snapshot under
    a live board). Taps join only when live, and only priced taps carry
    an offer: schema.org without a price is fine, an invented price is not.
  */
  const menuSchema = {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: "Copper Athletic Club Menu",
    url: `${SITE.url}/menu`,
    hasMenuSection: [
      ...sections.map((s) => ({
        "@type": "MenuSection",
        name: s.name,
        hasMenuItem: s.items.map((i) => ({
          "@type": "MenuItem",
          name: i.name,
          description: i.desc,
          offers: { "@type": "Offer", price: i.price, priceCurrency: "USD" },
        })),
      })),
      ...(drinks.live.taps && drinks.taps.length > 0
        ? [
            {
              "@type": "MenuSection",
              name: "On Tap",
              hasMenuItem: drinks.taps.map((t) => ({
                "@type": "MenuItem",
                name: t.name,
                ...(t.brewery ? { description: t.brewery } : {}),
                ...(t.price
                  ? { offers: { "@type": "Offer", price: t.price, priceCurrency: "USD" } }
                  : {}),
              })),
            },
          ]
        : []),
    ],
  };

  const tapsLive = drinks.live.taps && drinks.taps.length > 0;

  return (
    <>
      <PageHero
        title="Menu"
        subtitle="Bar favorites and hometown comfort eats. Dine in, carry out, or order online."
        image="/img/burger.webp"
        imageAlt="A Copper Athletic Club burger on a brioche bun with a side of natural cut fries"
      />

      <Section>
        <div className="mb-14 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button href={SITE.orderUrl}>
            Order Online
          </Button>
          <Button href="/brunch" variant="outline">
            Sunday Brunch Menu
          </Button>
          <p className="text-sm text-cream-dim/70 sm:ml-4">{KITCHEN_NOTE}</p>
        </div>

        <MenuList sections={sections} />

        {/* The bar. "No invented tap list, because the taps rotate" used to
            end here, and it was right: nothing in this repo ever knew what
            was pouring. Now the bar does. Taps render from the Scooplist
            feed the bar edits itself (lib/taplist.ts), and when the feed is
            down, empty, or misconfigured this block is exactly the old
            panel, because a guessed tap list is still worse than an honest
            shrug. The curls joke stays as the bar area's header either way:
            it is a wink about beer, not a label someone has to decode. */}
        <div id="taps" className="curls mt-14">
          <div>
            <h2 className="curls-title display">12 oz curls</h2>
            <p className="curls-sub">Draft, bottles, cans and a full bar. The only reps we count.</p>
          </div>
          <p className="curls-note">
            {tapsLive ? "Taps rotate. This board keeps up." : "Taps rotate. Ask what’s pouring."}
          </p>
        </div>
        {tapsLive && (
          <TapList taps={drinks.taps} onDeck={drinks.onDeck} updatedAt={drinks.updatedAt} />
        )}

        <div className="mt-10 space-y-3 border-t border-ink-line pt-8 text-xs leading-relaxed text-cream-dim/60">
          <p>Prices subject to change. Ask your server about seasonal specials.</p>
          <p>{CONSUMER_ADVISORY}</p>
        </div>
      </Section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(menuSchema) }}
      />
    </>
  );
}
