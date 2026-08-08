import Image from "next/image";
import Link from "next/link";
import { Button, Eyebrow, Heading, Section } from "@/components/ui";
import Board from "@/components/Board";
import LiveStatus from "@/components/LiveStatus";
import { HOURS, KITCHEN_NOTE, SITE, upcomingEvents } from "@/lib/site";

// The board pulls live Detroit scores, so the homepage regenerates every 15
// minutes instead of being frozen at build time.
export const revalidate = 900;

export default function Home() {
  const nextEvent = upcomingEvents()[0];

  return (
    <>
      {/* Hero. The current site puts an uncropped photo here with no headline
          and no call to action, which on mobile means a full screen of nothing. */}
      <section className="relative flex min-h-[88vh] items-center overflow-hidden">
        <Image
          src="/img/interior-wide.webp"
          alt="The Copper Athletic Club dining room, with the long copper bar, exposed beams and walls of framed Detroit sports memorabilia"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/85 to-ink/55 lg:bg-gradient-to-r lg:via-ink/85 lg:to-ink/30" />
        <div className="relative mx-auto w-full max-w-7xl px-5 py-24 lg:px-8">
          <div className="max-w-2xl">
            <Eyebrow>Downtown Marshall, Michigan</Eyebrow>
            <h1 className="mt-5 text-5xl uppercase leading-[0.95] text-cream sm:text-6xl lg:text-7xl">
              A sports bar.
              <br />
              <span className="text-copper">Not a gym.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-cream-dim sm:text-lg">
              Born from the spirit of Detroit sports and built on the bones of the beloved
              Copper Bar. Every wall is memorabilia, every TV has the game, and the kitchen
              runs until 10.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Button href={SITE.orderUrl} external>
                Order Online
              </Button>
              <Button href="/menu" variant="outline">
                See the Menu
              </Button>
            </div>
            <p className="display mt-7 text-[11.5px] uppercase tracking-[0.22em] text-cream-dim/70">
              Est. 2013 · 14 screens · 0 treadmills
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-cream-dim/70">
              <LiveStatus />
              <a
                href={SITE.phoneHref}
                className="text-copper-light underline underline-offset-4 hover:text-copper"
              >
                {SITE.phone}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Live Detroit board, the thing their WordPress site can't do. */}
      <Board />

      {/* Three ways in, right below the fold. Named plainly on purpose: these
          are the things people came to find, so they get the words people
          search for, not the house joke. */}
      <Section dark className="!py-0">
        <div className="grid divide-y divide-ink-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <QuickCard
            title="Menu"
            body="Burgers, coneys, wings and a Detroit-style loose burger that people drive in for. Kitchen runs till 10."
            href="/menu"
            cta="View the menu"
          />
          <QuickCard
            title="Sunday Brunch"
            body="Every Sunday, 9 to 2. Peach cobbler french toast, four kinds of bloody, mimosa flights."
            href="/brunch"
            cta="See brunch"
          />
          <QuickCard
            title="Copper Reserve"
            body="The private room upstairs seats 72 with its own bar, four TVs and the Sunday Ticket. $50 an hour."
            href="/reserve"
            cta="Reserve the space"
          />
        </div>
      </Section>

      {/* Story */}
      <Section>
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="relative aspect-4/3 overflow-hidden rounded-sm">
            <Image
              src="/img/taps.webp"
              alt="A row of beer tap handles at the Copper Athletic Club, including Michigan breweries"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <Eyebrow>Since the Copper Bar</Eyebrow>
            <Heading className="mt-5">A shrine to Michigan sports</Heading>
            <div className="mt-7 space-y-5 text-base leading-relaxed text-cream-dim">
              <p>
                Inspired by the iconic Lindell Athletic Club in Detroit and built on the
                foundation of the beloved Copper Bar, we combined two Michigan favorites
                into one room.
              </p>
              <p>
                Memorabilia covers every inch of the walls. The TVs have the game. Whether
                you are repping the Tigers, Lions, Pistons, Red Wings or Wolverines, you
                will find your team here.
              </p>
              <p>
                Come for the game, stay for the food. Classic bar favorites and hometown
                comfort eats, with an atmosphere that brings the energy.
              </p>
            </div>
            <div className="mt-9">
              <Button href="/menu" variant="outline">
                What we are cooking
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* Next event. upcomingEvents() filters by date, so a finished night
          disappears here on its own at the next 15-minute revalidate. */}
      {nextEvent && (
        <Section dark>
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
            {nextEvent.image && (
              <div className="relative mx-auto aspect-4/5 w-full max-w-sm overflow-hidden rounded-sm lg:max-w-none">
                <Image
                  src={nextEvent.image}
                  alt={nextEvent.imageAlt ?? nextEvent.title}
                  fill
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="object-cover"
                />
              </div>
            )}
            <div>
              <Eyebrow>Coming up</Eyebrow>
              <Heading className="mt-5">{nextEvent.title}</Heading>
              <p className="display mt-5 text-lg uppercase tracking-wide text-copper-light">
                {nextEvent.displayDate} · {nextEvent.time}
              </p>
              <ul className="mt-7 space-y-3 text-base text-cream-dim">
                {nextEvent.price && <Bullet>{nextEvent.price}</Bullet>}
                {nextEvent.details.map((d) => (
                  <Bullet key={d}>{d}</Bullet>
                ))}
              </ul>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                {nextEvent.ticketUrl && (
                  <Button href={nextEvent.ticketUrl} external>
                    Get Tickets
                  </Button>
                )}
                <Button href="/events" variant="outline">
                  All events
                </Button>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Review */}
      <Section>
        <figure className="mx-auto max-w-3xl text-center">
          <blockquote className="display text-2xl uppercase leading-snug text-cream sm:text-3xl">
            &ldquo;I just love this place. Dedicated to Detroit, great menu, great food,
            great service. It is a must try if you are in Marshall Michigan.&rdquo;
          </blockquote>
          <figcaption className="mt-8 text-sm uppercase tracking-[0.25em] text-copper-light">
            John Costa
            <span className="mt-2 block tracking-normal text-cream-dim/60 normal-case">
              Google review
            </span>
          </figcaption>
        </figure>
      </Section>

      {/* Visit block: hours, address, directions, tap to call. */}
      <Section dark>
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <Eyebrow>Find us</Eyebrow>
            <Heading className="mt-5">133 W. Michigan Ave.</Heading>
            <p className="mt-5 text-base leading-relaxed text-cream-dim">
              Right in the heart of downtown Marshall, one block off the fountain. Street
              parking out front and a lot around the corner.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Button href={SITE.mapUrl} external>
                Get Directions
              </Button>
              <Button href={SITE.phoneHref} variant="outline">
                Call {SITE.phone}
              </Button>
            </div>
          </div>
          <div>
            <h2 className="display text-sm uppercase tracking-[0.3em] text-copper-light">Hours</h2>
            <dl className="mt-7 divide-y divide-ink-line border-y border-ink-line">
              {HOURS.map((h) => (
                <div key={h.label} className="flex items-baseline justify-between gap-6 py-4">
                  <dt className="text-base text-cream">{h.label}</dt>
                  <dd className="display text-base text-copper-light">{h.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-sm text-cream-dim/70">{KITCHEN_NOTE}</p>
          </div>
        </div>
      </Section>
    </>
  );
}

function QuickCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Link href={href} className="group block px-5 py-14 lg:px-12">
      <h2 className="display text-2xl uppercase tracking-widest text-copper">{title}</h2>
      <p className="mt-4 text-base leading-relaxed text-cream-dim">{body}</p>
      <span className="display mt-6 inline-flex items-center gap-2 text-sm uppercase tracking-widest text-cream transition-colors group-hover:text-copper-light">
        {cta}
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-copper" />
      <span>{children}</span>
    </li>
  );
}
