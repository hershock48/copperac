import type { Metadata } from "next";
import OrderClient from "@/components/ordering/OrderClient";
import { PageHero, Section } from "@/components/ui";
import { ORDERABLE_MENU } from "@/lib/ordering/menu";
import { CONSUMER_ADVISORY, KITCHEN_NOTE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Order Online",
  description:
    "Order ahead for pickup at Copper Athletic Club in downtown Marshall. Burgers, wings, coneys, and cocktails to go.",
  alternates: { canonical: "/order" },
  openGraph: {
    title: "Order Online | Copper Athletic Club",
    description:
      "Order ahead for pickup in downtown Marshall. Burgers, wings, coneys, and cocktails to go.",
    images: [{ url: "/og/menu.jpg", width: 1200, height: 630, alt: "Copper Athletic Club burgers, coneys and wings, ready for pickup" }],
  },
};

export default function OrderPage() {
  return (
    <>
      {/* The subtitle says what a guest does, nothing about how the ordering
          is built. "On our own website" shipped here briefly and Kevin killed
          it: the customer already assumes that, so it read as the site talking
          about itself. Who runs the ordering is pitch material, not menu copy. */}
      <PageHero
        title="Order Online"
        subtitle="Order ahead, pick it up at the bar."
        image="/img/burger.webp"
        imageAlt="A Copper Athletic Club burger on a brioche bun with a side of natural cut fries"
      />
      <Section>
        <OrderClient sections={ORDERABLE_MENU} />
        <div className="mt-4 space-y-3 border-t border-ink-line pt-8 text-xs leading-relaxed text-cream-dim/60">
          <p>{KITCHEN_NOTE} Cocktails to go leave sealed, per Michigan law, and the ID check happens at the counter.</p>
          <p>{CONSUMER_ADVISORY}</p>
        </div>
      </Section>
    </>
  );
}
