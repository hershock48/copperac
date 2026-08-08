import type { Metadata } from "next";
import MenuList from "@/components/MenuList";
import { Button, PageHero, Section } from "@/components/ui";
import { BRUNCH_MENU } from "@/lib/menu";
import { CONSUMER_ADVISORY, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sunday Brunch",
  description:
    "Sunday brunch at Copper Athletic Club in Marshall, MI. 9 AM to 2 PM every Sunday. Peach cobbler french toast bake, breakfast nachos, mimosa flights and four house bloody marys.",
  alternates: { canonical: "/brunch" },
  openGraph: {
    title: "Sunday Brunch | Copper Athletic Club",
    description:
      "Every Sunday, 9 AM to 2 PM in downtown Marshall. Peach cobbler french toast bake, breakfast nachos, mimosa flights.",
    images: [{ url: "/img/interior-bar.webp", width: 1024, height: 683, alt: "The bar at Copper Athletic Club" }],
  },
};

export default function BrunchPage() {
  return (
    <>
      <PageHero
        title="Sunday Brunch"
        subtitle="Every Sunday, 9 AM to 2 PM. Walk in, bring the whole table, and start with a mimosa flight."
        image="/img/interior-bar.webp"
        imageAlt="The Copper Athletic Club bar set for service on a Sunday morning"
      />

      <Section>
        <div className="mb-14 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button href={SITE.phoneHref}>Call for a Large Party</Button>
          <Button href="/menu" variant="outline">
            Full Menu
          </Button>
          <p className="text-sm text-cream-dim/70 sm:ml-4">
            Brunch is served Sundays only, 9:00 AM – 2:00 PM.
          </p>
        </div>

        <MenuList sections={BRUNCH_MENU} />

        <div className="mt-10 space-y-3 border-t border-ink-line pt-8 text-xs leading-relaxed text-cream-dim/60">
          <p>Prices subject to change. Ask your server about seasonal specials.</p>
          <p>{CONSUMER_ADVISORY}</p>
        </div>
      </Section>
    </>
  );
}
