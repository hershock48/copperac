import type { Metadata } from "next";
import MenuList from "@/components/MenuList";
import { Button, PageHero, Section } from "@/components/ui";
import { getMenus } from "@/lib/content";
import { CONSUMER_ADVISORY, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sunday Brunch",
  description:
    "Sunday brunch at Copper Athletic Club in Marshall, MI. 9 AM to 2 PM every Sunday. Peach cobbler french toast bake, breakfast nachos and mimosa flights.",
  alternates: { canonical: "/brunch" },
  openGraph: {
    url: "/brunch",
    type: "website",
    siteName: "Copper Athletic Club",
    title: "Sunday Brunch | Copper Athletic Club",
    description:
      "Every Sunday, 9 AM to 2 PM in downtown Marshall. Peach cobbler french toast bake, breakfast nachos, mimosa flights.",
    images: [{ url: "/og/brunch.jpg", width: 1200, height: 630, alt: "Sunday brunch at Copper Athletic Club, 9 AM to 2 PM every Sunday" }],
  },
};

export default async function BrunchPage() {
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

        <MenuList sections={(await getMenus()).brunch} />

        <div className="mt-10 space-y-3 border-t border-ink-line pt-8 text-xs leading-relaxed text-cream-dim/60">
          <p>Prices subject to change. Ask your server about seasonal specials.</p>
          <p>{CONSUMER_ADVISORY}</p>
        </div>
      </Section>
    </>
  );
}
