# Copper Athletic Club: Glazed Web concept

A rebuild concept for [copperac.com](https://copperac.com), a sports bar at 133 W. Michigan Ave. in Marshall, MI.

The brand is theirs and stays theirs: the copper deer logo, the copper-on-black palette, their own photography and their own menu copy. What changed is the execution.

## Stack

Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript. Every route is statically prerendered. No CMS lock-in, no plugin stack.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## What this fixes

Findings from an audit of the live WordPress/Elementor site.

### Search and sharing

| Problem on the live site | Fixed here |
| --- | --- |
| Events page meta and Open Graph tags still advertise "Copper Bash 2023 – Saturday, September 23rd" | Page metadata is generated from `EVENTS` in `lib/site.ts`, so it cannot drift from what's on the page |
| Homepage title tag is `CAC Home` | `Copper Athletic Club \| Sports Bar in Marshall, MI` |
| No meta description on homepage or contact | Every route has a written title, description and OG image |
| No `LocalBusiness` / `Restaurant` schema anywhere | Full `Restaurant` schema with address, geo, hours, `hasMenu` and an `OrderAction`, plus `Menu` and `Event` schema |
| No sitemap or robots directives | `app/sitemap.ts` and `app/robots.ts` |

### Usability

- Phone number is a `tel:` link everywhere. On the live site it is plain text, so a phone can't tap to call.
- Real email address and a `mailto:` link. The live site has neither.
- Map embed and a "Get directions" link on the contact page and in the footer.
- Order Online and See the Menu are both above the fold on mobile. The live mobile homepage opens with a full screen of uncropped photo and no call to action.
- Skip-to-content link, visible keyboard focus rings, `aria-current` on the active nav item, real alt text on every image, `prefers-reduced-motion` respected.
- Accessibility is stated plainly on the Reserve and Contact pages instead of buried as a bullet reading "Not handicap accessible at this time."

### Brand consistency

- The Copper Reserve now runs the same copper-on-black system as the rest of the site. The live version is a separate navy palette with a blue-gray logo. The Reserve wordmark here is their existing logo recolored to the brand copper (`#b86d2a`, sampled from their own logo file).
- One button style sitewide. The live Events page uses a purple-to-blue gradient button that matches neither palette.
- Forms are styled to the brand instead of the plugin default.

### Content

- Menu content is lifted from their live `schema.org` markup, so prices and descriptions match what they have today. Typos fixed: "Non-Alcoholic Opitions" and "Budlight".
- Prices render as `$12` rather than `12.00`, and add-ons read `+ $5` rather than `~ 5`.
- Consumer advisory added. The live menus asterisk the eggs and burgers with no advisory anywhere on the site.
- Kitchen hours are stated separately from bar hours. Confirmed with the owner (Aug 2026): the kitchen closes at 10 PM and the bar stays open until midnight. Both numbers are right, which is the problem on the live site: it lists only the venue hours and never mentions the kitchen, so a guest reads midnight while Toast separately shows a 10 PM cutoff and nothing reconciles them.

### Performance

Images converted to WebP and resized. The event flyer went from a 1.9MB PNG to 252KB, the hero from 1.4MB to 175KB. The live homepage loads 32 script tags and 33 stylesheets; this one ships about 100KB of JS total.

## The proposal page

`public/pitch/copper-athletic-club.html` is the Glazed Web proposal, and it is a
single self-contained file with no build step so it can be hand-edited.

Its stylesheet and all three animated donut marks are lifted **verbatim** from
`pitch/griffin-claw/index.html` in the `griffin-claw-rebuild` repo. That is
deliberate: an approximation of the brand drifts the next time the real brand
changes. If the Glazed system changes, change it there and copy it across rather
than editing tokens here. Griffin Claw's pricing calculator and price-box CSS
were stripped rather than left unused, because this proposal has no prices in it
by request.

It is served on its own marketing host:

| URL | Serves |
| --- | --- |
| `copperac.glazedweb.com` | the proposal |
| `copperac.glazedweb.com/demo` | this site, the working rebuild |
| `copperac.com` and `copperac.vercel.app` | this site at the root, no proposal anywhere |

That split is three host-scoped rewrites in `next.config.ts`, and they live in
`beforeFiles` for a reason: a plain `rewrites()` array is `afterFiles`, which
only runs once Next has failed to find a page, and `app/page.tsx` already
answers `/`. In `afterFiles` the root rewrite silently never fires.

It is done with host scoping rather than `basePath: "/demo"` because `basePath`
is global to a build, so it would also bury the real client site under `/demo`
the day `copperac.com` goes live.

One known wart, and it is acceptable: the app's links are root-relative, so a
visitor who lands on `/demo` and clicks Menu ends up at `/menu`, not
`/demo/menu`. Nothing 404s and they stay on the demo host; the prefix just drops
off after the first click.

Every path on `copperac.glazedweb.com` sends `X-Robots-Tag: noindex, nofollow`,
because `/demo` is a full copy of the client's site and must never compete with
`copperac.com` for their own name. `copperac.vercel.app` is still indexable and
is the same duplicate-content risk; worth a noindex or deletion before launch.

Every claim in "What we found" was checked against the live site on 8 August
2026 and links to the page that proves it. Two things were left out because they
could not be verified: any page-speed score for copperac.com (Google's PageSpeed
API rate-limited every attempt) and any hex value for the Reserve page's palette,
where only the blue logo file name is provable. Do not add either back without
checking them first.

**Check copperac.com in a real browser, not by fetching the HTML.** Two claims
in this proposal were written wrong because the page source is not the page.
The Copper Bash 2023 line was published as visible body copy when it only lives
in the `<meta>` description, and the Facebook page plugin at the foot of the
homepage was twice written off as not existing at all, because it and the Yelp
waitlist are both injected by JavaScript and appear nowhere in the served HTML.
Kevin found both on his phone. Anything to do with what a visitor actually sees,
especially third-party embeds, gets loaded and scrolled before it gets written
down.

Inherited AA issue: `--mute` (#8A7663) on the cream ground measures 4.03 and
fails for body text, 25 instances. It is Griffin Claw's own token, so matching
the brand won over diverging quietly. Fixing it means fixing both proposals.

**Delete this file and the rewrites once Copper signs or passes.**

## The TV counts, and why there are three of them

Confirmed by Kevin on 9 August 2026: **seven in the main bar, four upstairs in
the Copper Reserve, eleven in the building.**

It took three passes to get here. The homepage `h1` shipped as 14, which I
invented, then 9, then 7 plus 4. Nothing published states any of it: copperac.com
says only "TVs broadcasting the big game" with no number, and it is in neither
their Google nor their Yelp listing. So it can only come from someone standing
in the room, there is no source to re-check it against, and if the bar renovates
nothing will tell us it went stale.

All of it lives in `lib/site.ts` as `tvCountMain`, `tvCountReserve` and
`tvCountTotal`. Every place in the app that names a number reads one of them:
the `h1`, the Reserve card on the homepage, the Reserve spec table, the Reserve
page's `metadata` and OG descriptions, and the Reserve paragraph on `/events`.
Six surfaces that were six independent copies before.

The `h1` uses `tvCountMain`, the main bar rather than the building, because that
is the room you walk into. `tvCountTotal` exists for whenever eleven is the
better brag, which for a sports bar it arguably is; that is a one-word change.

**Two places still cannot read the constants and have to be changed by hand.**
This is how the 14 outlived its own correction by half a day, so they are named
here rather than left to be rediscovered:

- `public/og/home.jpg`, the share-preview image, rebuilt from `cop-og/gen.mjs`.
  There is no way to grep a JPEG.
- The Copper card in the glazedweb portfolio, in that repo's `app/page.jsx`.

Both carry the main-bar number. If it changes again, those are the two to
remember.

## The enquiry form does not reach an inbox yet

Read this before showing anyone the `/reserve` or `/contact` form, because it is
the one thing on the site that can cost the client real business.

Right now `app/api/inquiry/route.ts` answers `503 not_configured`, and
`InquiryForm` responds by opening the visitor's email app with every field
prefilled, addressed to `SITE.email`. It does not claim the message was sent.
That is the intended unconfigured behaviour, not a bug, and it is a deliberate
replacement for what was there before: a stub that waited half a second, showed
"Thanks, we got it", and sent nothing anywhere.

Two separate things are missing, and fixing one without the other gets you
nothing:

**1. Nobody has confirmed the club's inbox.** `info@copperac.com` in
`lib/site.ts` is a placeholder. Ask the owner for the address a human actually
reads, and set it as `INQUIRY_TO`.

**2. No mail provider is configured.** The Resend call is written and tested. It
needs three environment variables in the Vercel project, listed in
`.env.example`.

On the sending domain, which is the part that trips people up: Resend requires
DNS records on whatever domain the From address lives on, and we do not control
`copperac.com`'s DNS, the client does. **Do not wait on them.** Verify
`glazedweb.com` in Resend and send from something like `copper@glazedweb.com`.
The route sets `reply_to` to the customer's own address, so the club hits reply
and the reply lands with the customer. No client DNS work, and one verified
domain covers every site we build.

Then submit the form once against the deploy and confirm it arrives. The success
panel only renders when Resend accepted the message, so seeing it is the proof.

Known gap while it stays unconfigured: the `mailto:` handoff needs a registered
mail handler on the visitor's machine. Desktop webmail users get the on-screen
note and the phone number and nothing else. Closing that means rendering the
composed message on the page with a copy button, the way the Cookin' with Beans
order builder does.

## Online ordering: ours, replacing Toast's

The `/order` page replaces the Toast online ordering channel: guests order
pickup on the club's own site, every "Order Online" surface points at it (one
constant, `SITE.orderUrl`), and orders land on `/kitchen`, a PIN-gated staff
board that rings until each ticket is accepted. Toast the POS stays in the
building untouched; this takes only the online channel. Kevin's call, August
2026: full menu including cocktails to go (their Toast page already sells
them; Michigan made cocktails-to-go permanent in 2023). Orders with drinks
require a 21+ acknowledgment at checkout and carry an ID CHECK flag on the
kitchen ticket.

The model: a 99 cent order fee paid by the guest, disclosed in the banner
above the menu and again as a labeled line in the cart, never sprung at
payment. Half stays with the bar, half is Glazed Web's platform fee, taken as
a Stripe `application_fee_amount` when payments are wired. Until
`STRIPE_SECRET_KEY` is set, checkout runs in demo mode: the order is placed,
nothing is charged, and the pay button says so.

Decisions worth knowing before touching it:

- **The orderable menu is Copper's live Toast menu**, harvested item by item
  from Toast's server-rendered share pages into `lib/ordering/toast-menu.json`
  (114 items, real modifier groups, 50 item photos): see the header comment in
  `lib/ordering/menu.ts` for the harvesting method and the re-harvest note.
  Photos hot-link to Toast's public CDN (the bar's own uploads). **Mirror them
  into `public/img/menu/` before the bar ever leaves Toast**, or they vanish.
  The site's display menu (`lib/menu.ts`) disagrees with Toast on items and
  some prices (Nachos $12 vs $16); reconciling the two is a client question.
- **The server is the till.** Client prices are display only; the order API
  recomputes everything from the menu, revalidates 86s and hours, and rejects
  with a human sentence, not a code.
- **Pause always auto-resumes** (30/60/90 minutes). A Friday-rush pause that
  someone forgets cannot silently kill Saturday. Expired pauses clear on read.
- **Storage is Postgres when `DATABASE_URL` exists, memory otherwise.** Memory
  is fine locally and a trap deployed (orders can land on a lambda the kitchen
  screen never polls), so the kitchen board shows a red banner when it is
  running on memory.
- **Ordering hours derive from the posted hours** (last order 9:30 PM, kitchen
  closes at 10), computed per request in America/Detroit, never at build time.
  `ORDERING_DEMO_ALWAYS_OPEN=1` overrides for pitching outside kitchen hours.
- `/kitchen` is noindex and out of the sitemap; the PIN is a gate for
  passers-by, not a vault, and the comment in `lib/ordering/auth.ts` says
  exactly where that line is.

## Before launch

- [ ] **Confirm the club's real enquiry inbox** (`info@copperac.com` in `lib/site.ts` is a placeholder)
- [ ] **Configure enquiry delivery**: verify `glazedweb.com` in Resend, then set `RESEND_API_KEY`, `INQUIRY_FROM` and `INQUIRY_TO` in Vercel. See `.env.example` and the section above
- [x] Kitchen close time confirmed by the owner: kitchen closes at 10 PM, bar stays open until midnight (Aug 2026). `KITCHEN_NOTE` is correct
- [ ] Confirm the accessibility wording with the owner
- [ ] Verify the lat/lng pin
- [ ] Shoot new photography, or at least re-shoot the hero. Current photos date to 2019
- [ ] Point `copperac.com` at the deploy, keeping the `/menus` to `/menu` redirect
- [ ] **Ordering: add the free Postgres** (Vercel project > Storage > Create Database > Neon). Without it orders live in one lambda's memory and the kitchen screen warns loudly
- [ ] **Ordering: set `KITCHEN_PIN`** (falls back to 0133, the street number, a placeholder not a secret)
- [ ] **Ordering: set `ORDERING_DEMO_ALWAYS_OPEN=1` on the demo deploy, and REMOVE it at go-live** so real guests get real hours
- [ ] **Ordering: wire Stripe Connect before real money** (see the PAYMENT SEAM comment in `app/api/ordering/order/route.ts`; until then checkout is demo mode and says so)
- [ ] **Ordering: Michigan tax consult before launch** — whether the platform must collect sales tax (marketplace facilitator question) is unsettled; the demo computes 6% for display
- [ ] **Ordering: confirm with the club that Toast online ordering gets turned off** when this goes live, so two order channels never run at once
- [ ] Decide on Next 16: three high-severity advisories in `postcss` and `sharp` only clear with the major bump

## Structure

```
app/
  layout.tsx        header, footer, Restaurant schema, sitewide metadata
  page.tsx          home
  menu/             food menu + Menu schema
  brunch/           Sunday brunch
  reserve/          The Copper Reserve, gallery, inquiry form
  events/           events + Event schema, generated metadata
  contact/          hours, map, directions, contact form
  order/            online ordering, guest side (menu, cart, demo checkout)
  kitchen/          staff board: orders + chime, 86 toggles, busy dial, pause
  api/ordering/     public state + order placement (server recomputes all prices)
  api/kitchen/      PIN login, order queue, staff state
components/         Header, Footer, MenuList, InquiryForm, ordering/, shared UI
lib/
  site.ts           business facts, hours, events (single source of truth)
  menu.ts           menu data
  ordering/         config (the 99 cent fee, hours window), derived orderable
                    menu, storage (Postgres or memory), kitchen auth
public/img/         WebP photography and logos
```

Everything a non-developer would want to change lives in `lib/site.ts` and `lib/menu.ts`.

---

Built by [Glazed Web](https://glazedweb.com). Logo and photography used with permission of Copper Athletic Club.
