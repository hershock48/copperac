import type { Metadata } from "next";
import MenuList from "@/components/MenuList";
import { Button, PageHero, Section } from "@/components/ui";
import { FOOD_MENU } from "@/lib/menu";
import { CONSUMER_ADVISORY, KITCHEN_NOTE, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Burgers, wings, coneys, Detroit-style loose burgers, tacos, salads and more at Copper Athletic Club in Marshall, MI. Order online or dine in.",
  alternates: { canonical: "/menu" },
  openGraph: {
    title: "Menu | Copper Athletic Club",
    description:
      "Burgers, wings, coneys, Detroit-style loose burgers, tacos, salads and more in downtown Marshall, MI.",
    images: [{ url: "/img/burger.webp", width: 1600, height: 900, alt: "Copper Athletic Club burger and fries" }],
  },
};

const menuSchema = {
  "@context": "https://schema.org",
  "@type": "Menu",
  name: "Copper Athletic Club Menu",
  url: `${SITE.url}/menu`,
  hasMenuSection: FOOD_MENU.map((s) => ({
    "@type": "MenuSection",
    name: s.name,
    hasMenuItem: s.items.map((i) => ({
      "@type": "MenuItem",
      name: i.name,
      description: i.desc,
      offers: { "@type": "Offer", price: i.price, priceCurrency: "USD" },
    })),
  })),
};

export default function MenuPage() {
  return (
    <>
      <PageHero
        title="The Training Table"
        subtitle="Bar favorites and hometown comfort eats. Dine in, carry out, or order online. The only reps we count are 12 oz."
        image="/img/burger.webp"
        imageAlt="A Copper Athletic Club burger on a brioche bun with a side of natural cut fries"
      />

      <Section>
        <div className="mb-14 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button href={SITE.orderUrl} external>
            Order Online
          </Button>
          <Button href="/brunch" variant="outline">
            Sunday Brunch Menu
          </Button>
          <p className="text-sm text-cream-dim/70 sm:ml-4">{KITCHEN_NOTE}</p>
        </div>

        <MenuList sections={FOOD_MENU} />

        {/* The bar, named in the house voice. No invented tap list — the taps
            rotate, so this points people at the bar instead of lying about it. */}
        <div className="curls mt-14">
          <div>
            <span className="curls-title display">12 oz curls</span>
            <p className="curls-sub">Draft, bottles, cans and a full bar. The only reps we count.</p>
          </div>
          <p className="curls-note">Taps rotate — ask what&apos;s pouring.</p>
        </div>

        <div className="mt-10 space-y-3 border-t border-ink-line pt-8 text-xs leading-relaxed text-cream-dim/60">
          <p>Prices subject to change. Ask your server about seasonal specials.</p>
          <p>{CONSUMER_ADVISORY}</p>
        </div>
      </Section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(menuSchema) }}
      />
    </>
  );
}
