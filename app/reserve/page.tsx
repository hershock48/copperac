import type { Metadata } from "next";
import Image from "next/image";
import InquiryForm from "@/components/InquiryForm";
import { Button, Eyebrow, Heading, Section } from "@/components/ui";
import { ACCESSIBILITY_NOTE, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "The Copper Reserve | Private Event Space",
  description:
    "Marshall's premier private bar and event space. Seats 72 with its own bartender, four TVs with the DIRECTV Sports Package and NFL Sunday Ticket. $50 per hour. Birthdays, fantasy drafts, showers, business meetings.",
  alternates: { canonical: "/reserve" },
  openGraph: {
    title: "The Copper Reserve | Private Event Space in Marshall, MI",
    description:
      "Seats 72 with its own bartender, four TVs and the NFL Sunday Ticket. $50 per hour. No setup, no cleanup, just show up.",
    images: [{ url: "/img/reserve-wide.webp", width: 1027, height: 685, alt: "The Copper Reserve private event space" }],
  },
};

const SPECS = [
  { label: "Rate", value: "$50 per hour, or $25 per half hour" },
  { label: "Includes", value: "A personal bartender for your party" },
  { label: "Capacity", value: "Seating for up to 72 guests" },
  { label: "Food", value: "Buffet style, built around your group" },
  { label: "TVs", value: "Four screens, DIRECTV Sports Package, NFL Sunday Ticket, pay-per-view on request" },
  { label: "Sound", value: "Entertainment system with music playable from Spotify" },
  { label: "Connectivity", value: "WiFi and casting to the TVs for meetings or fantasy drafts" },
];

const OCCASIONS = [
  "Birthdays",
  "Fantasy drafts",
  "Watch parties",
  "Brunch",
  "Happy hour",
  "Showers",
  "Dinners",
  "Business meetings",
  "Cocktail parties",
  "Fundraisers",
  "Game night",
  "Wedding receptions",
];

const BUFFET = [
  "Taco / nacho bar",
  "Coney and hot dog bar",
  "BBQ pulled pork sandwich bar",
  "Salad bowls",
  "Mac n cheese",
  "Homemade soups",
];

const BRUNCH_OPTIONS = [
  "Scrambled eggs",
  "Biscuits and gravy",
  "Seasonal bake",
  "Bacon",
  "Sausage",
  "Copper hashbrowns",
];

const GALLERY = [
  { src: "/img/reserve-eastwall.webp", alt: "The east wall of the Copper Reserve, lined with framed sports photography" },
  { src: "/img/reserve-party.webp", alt: "The Copper Reserve set up for a birthday party with balloons and centerpieces" },
  { src: "/img/reserve-food.webp", alt: "A buffet line set up along the long table in the Copper Reserve" },
  { src: "/img/reserve-shelves.webp", alt: "Liquor shelves behind the private bar in the Copper Reserve" },
];

export default function ReservePage() {
  return (
    <>
      {/* Same copper-on-black system as the rest of the site. The current
          Copper Reserve page runs a separate navy palette and blue logo. */}
      <section className="relative flex min-h-[70vh] items-center overflow-hidden">
        <Image
          src="/img/reserve-wide.webp"
          alt="The Copper Reserve, a long private room with communal tables and walls of framed memorabilia"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/85 to-ink/55 lg:bg-gradient-to-r lg:via-ink/85 lg:to-ink/40" />
        <div className="relative mx-auto w-full max-w-7xl px-5 py-24 lg:px-8">
          <Image
            src="/img/reserve-logo.png"
            alt="The Copper Reserve"
            width={680}
            height={348}
            className="h-24 w-auto"
          />
          <h1 className="mt-8 max-w-2xl text-4xl uppercase leading-[1.05] text-cream sm:text-5xl lg:text-6xl">
            We have the space.
            <br />
            <span className="text-copper">All you need is the occasion.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-cream-dim sm:text-lg">
            Marshall&rsquo;s premier private bar and rental space, upstairs from the Copper
            Athletic Club. No setup, no cleanup. Just show up.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button href="#inquire">Check Your Date</Button>
            <Button href={SITE.phoneHref} variant="outline">
              Call {SITE.phone}
            </Button>
          </div>
        </div>
      </section>

      <Section dark>
        <div className="grid gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <div>
            <Eyebrow>The details</Eyebrow>
            <Heading className="mt-5">What you get</Heading>
            <dl className="mt-9 divide-y divide-ink-line border-y border-ink-line">
              {SPECS.map((s) => (
                <div key={s.label} className="grid gap-1 py-5 sm:grid-cols-[140px_1fr] sm:gap-6">
                  <dt className="display text-xs uppercase tracking-[0.2em] text-copper">
                    {s.label}
                  </dt>
                  <dd className="text-base leading-relaxed text-cream-dim">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <Eyebrow>Good for</Eyebrow>
            <Heading className="mt-5">Just about anything</Heading>
            <ul className="mt-9 flex flex-wrap gap-2.5">
              {OCCASIONS.map((o) => (
                <li
                  key={o}
                  className="display rounded-sm border border-ink-line px-4 py-2.5 text-xs uppercase tracking-widest text-cream-dim"
                >
                  {o}
                </li>
              ))}
            </ul>
            <p className="mt-9 text-base leading-relaxed text-cream-dim">
              Bring your own decorations and make the space your own. We want your event to
              be unique and memorable, and our team is dedicated to helping you make that
              happen.
            </p>
          </div>
        </div>
      </Section>

      <Section>
        <Eyebrow>The room</Eyebrow>
        <Heading className="mt-5">Take a look</Heading>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {GALLERY.map((g) => (
            <div key={g.src} className="relative aspect-3/2 overflow-hidden rounded-sm">
              <Image
                src={g.src}
                alt={g.alt}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section dark>
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <Eyebrow>And the food</Eyebrow>
            <Heading className="mt-5">Let us handle it</Heading>
            <p className="mt-7 text-base leading-relaxed text-cream-dim">
              We offer a range of buffet options so your guests eat well and you focus on
              your people. Tell us your group and we will build the spread.
            </p>
            <div className="mt-10 grid gap-10 sm:grid-cols-2">
              <div>
                <h3 className="display text-sm uppercase tracking-[0.2em] text-copper">
                  Popular options
                </h3>
                <ul className="mt-5 space-y-2.5 text-base text-cream-dim">
                  {BUFFET.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="display text-sm uppercase tracking-[0.2em] text-copper">
                  Breakfast &amp; brunch
                </h3>
                <ul className="mt-5 space-y-2.5 text-base text-cream-dim">
                  {BRUNCH_OPTIONS.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="relative aspect-4/3 min-h-80 overflow-hidden rounded-sm">
            <Image
              src="/img/reserve-food.webp"
              alt="Chafing dishes and serving utensils set along the buffet table in the Copper Reserve"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </Section>

      <Section id="inquire">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
          <div>
            <Eyebrow>Book it</Eyebrow>
            <Heading className="mt-5">Check your date</Heading>
            <p className="mt-7 text-base leading-relaxed text-cream-dim">
              Send us the details and our events manager will confirm availability within
              one business day. Working on a tight timeline? Call and we will check the
              calendar while you are on the phone.
            </p>
            <div className="mt-9">
              <Button href={SITE.phoneHref} variant="outline">
                Call {SITE.phone}
              </Button>
            </div>
            <div className="mt-12 rounded-sm border border-ink-line p-6">
              <h3 className="display text-xs uppercase tracking-[0.2em] text-copper">
                Accessibility
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-cream-dim/80">
                {ACCESSIBILITY_NOTE}
              </p>
            </div>
          </div>
          <div className="rounded-sm border border-ink-line bg-ink-soft p-7 lg:p-10">
            <InquiryForm variant="reserve" />
          </div>
        </div>
      </Section>
    </>
  );
}
