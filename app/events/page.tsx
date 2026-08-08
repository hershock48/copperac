import type { Metadata } from "next";
import Image from "next/image";
import { Button, Eyebrow, Heading, PageHero, Section } from "@/components/ui";
import { EVENTS, SITE } from "@/lib/site";

// Metadata is generated from the event data, so it can never drift the way the
// current site's does (it still advertises Copper Bash 2023 to Google and Facebook).
const next = EVENTS[0];

export const metadata: Metadata = {
  title: "Events",
  description: next
    ? `${next.title} on ${next.displayDate}, ${next.time} at Copper Athletic Club in Marshall, MI. ${next.price ?? ""} Trivia, watch parties and live events all season.`.trim()
    : "Trivia, watch parties and live events at Copper Athletic Club in Marshall, MI.",
  alternates: { canonical: "/events" },
  openGraph: {
    title: next ? `${next.title} | Copper Athletic Club` : "Events | Copper Athletic Club",
    description: next
      ? `${next.displayDate}, ${next.time}. ${next.price ?? ""} ${next.details[0] ?? ""}`.trim()
      : "Trivia, watch parties and live events in downtown Marshall, MI.",
    // The branded card rather than the event flyer: flyers are portrait and
    // already carry their own type, so they crop badly and double up.
    images: [{ url: "/og/events.jpg", width: 1200, height: 630, alt: "Trivia, watch parties and live music at Copper Athletic Club" }],
  },
};

const eventSchema = EVENTS.map((e) => ({
  "@context": "https://schema.org",
  "@type": "Event",
  name: e.title,
  startDate: e.date,
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  image: e.image ? `${SITE.url}${e.image}` : undefined,
  description: e.details.join(". "),
  location: {
    "@type": "Place",
    name: SITE.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.street,
      addressLocality: SITE.city,
      addressRegion: SITE.state,
      postalCode: SITE.zip,
      addressCountry: "US",
    },
  },
  organizer: { "@type": "Organization", name: SITE.name, url: SITE.url },
  offers: e.ticketUrl
    ? {
        "@type": "Offer",
        url: e.ticketUrl,
        price: "10.00",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      }
    : undefined,
}));

export default function EventsPage() {
  return (
    <>
      <PageHero
        title="Upcoming Events"
        subtitle="Trivia nights, watch parties and whatever else we cook up. Tickets go through our online ordering, so grab yours before the room fills."
        image="/img/interior-wide.webp"
        imageAlt="The Copper Athletic Club dining room filled with framed Detroit sports memorabilia"
      />

      <Section>
        {EVENTS.length === 0 ? (
          <div className="rounded-sm border border-ink-line p-12 text-center">
            <Heading>Nothing on the books right now</Heading>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-cream-dim">
              We are between events at the moment. Follow us on Instagram or Facebook and
              you will hear about the next one first.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-4 sm:flex-row">
              <Button href={SITE.instagram} external>
                Follow on Instagram
              </Button>
              <Button href="/reserve" variant="outline">
                Host your own
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-24">
            {EVENTS.map((e) => (
              <article key={e.slug} className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
                {e.image && (
                  <div className="relative mx-auto aspect-4/5 w-full max-w-sm overflow-hidden rounded-sm lg:max-w-none">
                    <Image
                      src={e.image}
                      alt={e.imageAlt ?? e.title}
                      fill
                      sizes="(min-width: 1024px) 40vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="lg:pt-4">
                  <Eyebrow>
                    {e.displayDate} · {e.time}
                  </Eyebrow>
                  <Heading className="mt-5">{e.title}</Heading>
                  {e.price && (
                    <p className="display mt-5 text-lg uppercase tracking-wide text-copper-light">
                      {e.price}
                    </p>
                  )}
                  <ul className="mt-7 space-y-3 text-base text-cream-dim">
                    {e.details.map((d) => (
                      <li key={d} className="flex gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-copper"
                        />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                    {e.ticketUrl && (
                      <Button href={e.ticketUrl} external>
                        Get Tickets
                      </Button>
                    )}
                    <Button href={SITE.phoneHref} variant="outline">
                      Call {SITE.phone}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section dark>
        <div className="text-center">
          <Eyebrow>Want the room to yourself?</Eyebrow>
          <Heading className="mt-5">Host it in the Copper Reserve</Heading>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-cream-dim">
            Seats 72, has its own bartender and four TVs with the Sunday Ticket. $50 an
            hour.
          </p>
          <div className="mt-9 flex justify-center">
            <Button href="/reserve">See the Space</Button>
          </div>
        </div>
      </Section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventSchema) }}
      />
    </>
  );
}
