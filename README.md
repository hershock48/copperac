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
- Kitchen hours are stated separately from bar hours, which is the mismatch customers currently hit between the site (midnight) and the Toast ordering page (10 PM). **Confirm the real kitchen close time with the client.**

### Performance

Images converted to WebP and resized. The event flyer went from a 1.9MB PNG to 252KB, the hero from 1.4MB to 175KB. The live homepage loads 32 script tags and 33 stylesheets; this one ships about 100KB of JS total.

## Before launch

- [ ] Confirm kitchen close time (`KITCHEN_NOTE` in `lib/site.ts`)
- [ ] Confirm the email address (`info@copperac.com` is a placeholder)
- [ ] Wire the forms to a route handler and the client's inbox. Currently `components/InquiryForm.tsx` is a UI stub
- [ ] Confirm the accessibility wording with the owner
- [ ] Verify the lat/lng pin
- [ ] Shoot new photography, or at least re-shoot the hero. Current photos date to 2019
- [ ] Point `copperac.com` at the deploy, keeping the `/menus` → `/menu` redirect

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
