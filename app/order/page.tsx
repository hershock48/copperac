import type { Metadata } from "next";
import OrderClient from "@/components/ordering/OrderClient";
import { PageHero, Section } from "@/components/ui";
import { ORDERABLE_MENU } from "@/lib/ordering/menu";
import { CONSUMER_ADVISORY, KITCHEN_NOTE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Order Online",
  description:
    "Order Copper Athletic Club for pickup, straight from our kitchen in downtown Marshall. Burgers, wings, coneys, cocktails to go, no delivery apps.",
  alternates: { canonical: "/order" },
  openGraph: {
    title: "Order Online | Copper Athletic Club",
    description:
      "Pickup ordering straight from our kitchen in downtown Marshall. No delivery apps, no marked-up menu.",
    images: [{ url: "/og/menu.jpg", width: 1200, height: 630, alt: "Copper Athletic Club burgers, coneys and wings, ready for pickup" }],
  },
};

export default function OrderPage() {
  return (
    <>
      <PageHero
        title="Order Online"
        subtitle="Straight from our kitchen, on our own website. Order ahead, pick it up at the bar."
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
