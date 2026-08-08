import type { Metadata } from "next";
import InquiryForm from "@/components/InquiryForm";
import { Button, Eyebrow, Heading, PageHero, Section } from "@/components/ui";
import { ACCESSIBILITY_NOTE, HOURS, KITCHEN_NOTE, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact & Hours",
  description:
    "Copper Athletic Club is at 133 W. Michigan Ave. in downtown Marshall, MI. Call (269) 558-8222. Open Monday to Saturday 11 AM to midnight, Sunday from 9 AM.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact & Hours | Copper Athletic Club",
    description:
      "133 W. Michigan Ave., Marshall, MI. Call (269) 558-8222. Open Mon–Sat 11 AM to midnight, Sunday from 9 AM.",
    images: [{ url: "/og/contact.jpg", width: 1200, height: 630, alt: "Copper Athletic Club, 133 W. Michigan Ave., Marshall, Michigan" }],
  },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        title="Come See Us"
        subtitle="Right in the heart of downtown Marshall. Walk in, call ahead, or send us a note."
        image="/img/taps-square.webp"
        imageAlt="Beer tap handles lined up along the bar at Copper Athletic Club"
      />

      <Section>
        <div className="grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
          <div>
            <Eyebrow>Location</Eyebrow>
            <Heading className="mt-5" as="h2">
              133 W. Michigan Ave.
            </Heading>
            <address className="mt-5 text-base not-italic leading-relaxed text-cream-dim">
              {SITE.city}, {SITE.state} {SITE.zip}
            </address>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button href={SITE.mapUrl} external>
                Get Directions
              </Button>
              <Button href={SITE.phoneHref} variant="outline">
                Call {SITE.phone}
              </Button>
            </div>

            <p className="mt-6 text-base text-cream-dim">
              <a
                href={`mailto:${SITE.email}`}
                className="text-copper-light underline underline-offset-4 hover:text-copper"
              >
                {SITE.email}
              </a>
            </p>

            {/* Static map embed keeps the page fast and needs no API key. */}
            <div className="mt-10 overflow-hidden rounded-sm border border-ink-line">
              <iframe
                title="Map showing Copper Athletic Club at 133 W. Michigan Ave., Marshall, Michigan"
                src="https://www.openstreetmap.org/export/embed.html?bbox=-84.9700%2C42.2685%2C-84.9572%2C42.2749&layer=mapnik&marker=42.2717%2C-84.9636"
                className="h-72 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="mt-12">
              <h2 className="display text-sm uppercase tracking-[0.3em] text-copper-light">Hours</h2>
              <dl className="mt-6 divide-y divide-ink-line border-y border-ink-line">
                {HOURS.map((h) => (
                  <div key={h.label} className="flex items-baseline justify-between gap-6 py-4">
                    <dt className="text-base text-cream">{h.label}</dt>
                    <dd className="display text-base text-copper-light">{h.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-cream-dim/70">{KITCHEN_NOTE}</p>
            </div>

            <div className="mt-10 rounded-sm border border-ink-line p-6">
              <h2 className="display text-xs uppercase tracking-[0.2em] text-copper-light">
                Accessibility
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-cream-dim/80">
                {ACCESSIBILITY_NOTE}
              </p>
            </div>
          </div>

          <div className="rounded-sm border border-ink-line bg-ink-soft p-7 lg:p-10">
            <h2 className="display text-2xl uppercase tracking-wide text-cream">
              Send us a note
            </h2>
            <p className="mt-3 text-sm text-cream-dim/70">
              Booking a private party? Use the{" "}
              <a href="/reserve#inquire" className="text-copper-light underline underline-offset-4">
                Copper Reserve form
              </a>{" "}
              instead so we get your date and headcount.
            </p>
            <div className="mt-8">
              <InquiryForm variant="contact" />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
