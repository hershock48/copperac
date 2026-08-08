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

## The pitch page

`public/pitch/copper-athletic-club.html` is a standalone Glazed Web document. It
is a single self-contained file with no build step, so it can be edited directly.

It is served on its own marketing host:

| URL | Serves |
| --- | --- |
| `copperac.glazedweb.com` | the pitch |
| `copperac.glazedweb.com/demo` | this site, the working rebuild |
| `copperac.com` and `copperac.vercel.app` | this site at the root, no pitch anywhere |

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
off after the first click. Making it persist would require `basePath` and the
trade above.

Every path on `copperac.glazedweb.com` sends `X-Robots-Tag: noindex, nofollow`,
because `/demo` is a full copy of the client's site and must never compete with
`copperac.com` for their own name. `copperac.vercel.app` is still indexable and
is the same duplicate-content risk; worth a noindex or deletion before launch.

Every finding on it was verified against the live site on 8 August 2026 and
carries the URL that proves it. Two things were deliberately left out because
they could not be verified: any page-speed score for copperac.com (Google's
PageSpeed API rate-limited every attempt) and any hex value for the Reserve
page's palette (only the blue logo file name is provable). Do not add either
back without checking them first. There are no prices on the page by request.

Content is static HTML on purpose. An earlier draft generated the findings with
JavaScript and used a scroll-reveal animation, which meant the document had no
findings on it with JS off and left elements invisible when the observer did not
fire. JS now only enhances: filter chips, proof drawers, the live clock and the
bar widths.

**Delete this file and the rewrite once Copper has signed or passed.** A sales
page arguing with the client does not belong on the client's live site.

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

## Before launch

- [ ] **Confirm the club's real enquiry inbox** (`info@copperac.com` in `lib/site.ts` is a placeholder)
- [ ] **Configure enquiry delivery**: verify `glazedweb.com` in Resend, then set `RESEND_API_KEY`, `INQUIRY_FROM` and `INQUIRY_TO` in Vercel. See `.env.example` and the section above
- [x] Kitchen close time confirmed by the owner: kitchen closes at 10 PM, bar stays open until midnight (Aug 2026). `KITCHEN_NOTE` is correct
- [ ] Confirm the accessibility wording with the owner
- [ ] Verify the lat/lng pin
- [ ] Shoot new photography, or at least re-shoot the hero. Current photos date to 2019
- [ ] Point `copperac.com` at the deploy, keeping the `/menus` to `/menu` redirect
- [ ] Confirm the Toast plan includes Online Ordering Pro, then set up `order.copperac.com` and update `SITE.orderUrl`
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
components/         Header, Footer, MenuList, InquiryForm, shared UI
lib/
  site.ts           business facts, hours, events (single source of truth)
  menu.ts           menu data
public/img/         WebP photography and logos
```

Everything a non-developer would want to change lives in `lib/site.ts` and `lib/menu.ts`.

---

Built by [Glazed Web](https://glazedweb.com). Logo and photography used with permission of Copper Athletic Club.
