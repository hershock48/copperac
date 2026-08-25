import Image from "next/image";
import Link from "next/link";
import { Button, Eyebrow, Heading, Section } from "@/components/ui";
import Board from "@/components/Board";
import LiveStatus from "@/components/LiveStatus";
import { getDrinks } from "@/lib/taplist";
import { HOURS, KITCHEN_NOTE, SITE, upcomingEvents } from "@/lib/site";

// The board pulls live Detroit scores, so the homepage regenerates every 15
// minutes instead of being frozen at build time.
export const revalidate = 900;

export default async function Home() {
  const nextEvent = upcomingEvents()[0];

  /*
    The tap teaser is honest by construction: it renders ONLY when the
    Scooplist feed is live AND the bar has taps entered, so the LIVE chip
    can never point at a guess (this page's whole comment history is
    numbers nobody could re-check; this one re-checks itself away). The
    count can lag the menu page by up to this page's 900s revalidate,
    which is fine for presence; the full list stays on /menu on purpose,
    because the homepage already carries the sports board and the news,
    and a second copy of the taps doubles the stale surface.
  */
  const drinks = await getDrinks();
  const tapsLive = drinks.live.taps && drinks.taps.length > 0;

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
            {/* THE QUOTE LEADS AND THE H1 SITS UNDER IT, which looks like a
                demotion and is the opposite.

                What was here was "7 TVs. 0 treadmills." as the h1, a joke with
                no keywords in it, and an eyebrow reading "Sports bar · Downtown
                Marshall, Michigan" that existed only to smuggle the search terms
                back in above it. The owner does not like the treadmills line, so
                the joke goes, and the workaround goes with it: the h1 can now
                say what the business is, in the words somebody types into a
                phone, which is what an h1 is for.

                The quote is a blockquote in a figure, not a heading. It is
                somebody else's sentence, so making it the page's h1 would tell
                a screen reader and a search engine that a 1950s locker room
                anecdote is what this page is about. Marked up properly it can
                be the biggest thing on the screen and still not claim to be the
                heading, which is exactly the arrangement we want.

                SOURCED, not remembered. Yale Lary, Lions safety and Layne's
                team-mate on the 1952, 1953 and 1957 championship sides. The
                newspaper setting runs "When Bobby said, 'Block,' you blocked,"
                Lary said. "And when Bobby said, 'Drink,' you drank." Only the
                comma after "said" and the capitals on Block and Drink differ
                here, which is compositor's punctuation from the sentence being
                split around an attribution that we are not printing.

                One thing NOT to add later: the Lindell A.C. line lower down is
                about the room's inspiration and has nothing to do with Layne.
                The bar took the "A.C." name in 1963, five years after Layne was
                traded, and he is not among the regulars its histories name. The
                quote earns its place as Detroit football, not as bar lore. */}
            <figure className="max-w-2xl">
              <blockquote className="display text-[1.75rem] leading-[1.15] text-cream sm:text-4xl lg:text-[2.6rem]">
                <span className="text-copper">&ldquo;</span>When Bobby said{" "}
                <span className="text-copper">&lsquo;block,&rsquo;</span> you blocked. And
                when Bobby said <span className="text-copper">&lsquo;drink,&rsquo;</span>{" "}
                you drank.<span className="text-copper">&rdquo;</span>
              </blockquote>
              <figcaption className="display mt-5 text-[11.5px] uppercase tracking-[0.22em] text-copper-light">
                Yale Lary, on playing with Bobby Layne
              </figcaption>
            </figure>

            {/* text-balance so the last word does not orphan. Without it desktop broke
                as "...DOWNTOWN MARSHALL," / "MICHIGAN". */}
            <h1 className="mt-9 max-w-xl text-balance text-2xl uppercase leading-[1.15] text-cream sm:text-3xl">
              A Detroit sports bar in downtown Marshall, Michigan
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-cream-dim sm:text-lg">
              Born from the spirit of Detroit sports and built on the bones of the beloved
              Copper Bar. Every wall is memorabilia and every screen dedicated to sports.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Button href={SITE.orderUrl}>
                Order Online
              </Button>
              <Button href="/menu" variant="outline">
                See the Menu
              </Button>
            </div>
            {/* Was "Est. 2013 · 14 screens · 0 treadmills", and every part of
                that came out for a different reason. The screen count and the
                founding year were both unverified, and the year was probably
                wrong: their own Facebook avatar reads "est. 2018" and nothing
                on copperac.com states one. The treadmills line is retired at
                the owner's request. What is left is the one part of their story
                they tell themselves, in their own words on their homepage:
                inspired by the Lindell A.C., built on the foundation of the
                beloved Copper Bar. */}
            <p className="display mt-7 text-[11.5px] uppercase tracking-[0.22em] text-cream-dim/70">
              Inspired by the Lindell A.C. · Built on the Copper Bar
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
        {/* Four cards divide cleanly only in one row, so the live state
            stays stacked until xl; a 2x2 at lg would put a stray divide-x
            border on the second row's first card. */}
        <div
          className={`grid divide-y divide-ink-line ${
            tapsLive
              ? "xl:grid-cols-4 xl:divide-x xl:divide-y-0"
              : "lg:grid-cols-3 lg:divide-x lg:divide-y-0"
          }`}
        >
          {tapsLive && (
            <QuickCard
              title="On Tap"
              body={`${drinks.taps.length} ${drinks.taps.length === 1 ? "tap" : "taps"} pouring right now, kept current by the bar as kegs change.`}
              href="/menu#taps"
              cta="See what's pouring"
              live
            />
          )}
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
            body={`The private room upstairs seats 72 with its own bar, ${SITE.tvCountReserve} TVs and the Sunday Ticket. $50 an hour.`}
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
                Memorabilia covers every inch of the walls. Most nights there is more than
                one game up and we will put yours on if you ask. When Detroit has a big one,
                it takes every screen in the room. Whether you are repping the Tigers, Lions,
                Pistons, Red Wings or Wolverines, you will find your team here.
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
  live = false,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
  /** Renders the pulsing live chip; pass it only for content that IS live
      (feed-backed), never for static copy dressed up as live. */
  live?: boolean;
}) {
  return (
    <Link href={href} className="group block px-5 py-14 lg:px-12">
      <h2 className="display flex flex-wrap items-center gap-3 text-2xl uppercase tracking-widest text-copper">
        {title}
        {live && (
          <span className="status-chip status-open">
            <span className="status-dot" aria-hidden="true" />
            Live
          </span>
        )}
      </h2>
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
