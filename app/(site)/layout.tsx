import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SITE } from "@/lib/site";
import { jsonLd } from "@/lib/jsonld";

/**
 * The customer site's chrome: header, footer, skip link, Restaurant schema.
 *
 * A route group, not the root layout, so the workroom (app/workroom) gets a
 * shell of its own instead of inheriting a shopfront header and a second
 * nested main, which anchor's audit counted as three landmark violations per
 * screen. Fonts, metadata and the body live in app/layout.tsx and apply to
 * both.
 */

// The current site has no LocalBusiness or Restaurant schema at all. This is what
// lets Google show hours, phone, directions and the order action in the listing.
const restaurantSchema = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "@id": `${SITE.url}/#restaurant`,
  name: SITE.name,
  alternateName: "Copper AC",
  description:
    "A sports bar, not a gym. Detroit sports memorabilia, cold taps, burgers and Sunday brunch in downtown Marshall, Michigan.",
  url: SITE.url,
  telephone: "+1-269-558-8222",
  email: SITE.email,
  priceRange: "$$",
  servesCuisine: ["American", "Bar Food", "Burgers"],
  image: [`${SITE.url}/img/interior-wide.webp`, `${SITE.url}/img/burger.webp`],
  logo: `${SITE.url}/img/logo.png`,
  address: {
    "@type": "PostalAddress",
    streetAddress: SITE.street,
    addressLocality: SITE.city,
    addressRegion: SITE.state,
    postalCode: SITE.zip,
    addressCountry: "US",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: SITE.geo.lat,
    longitude: SITE.geo.lng,
  },
  hasMap: SITE.mapUrl,
  sameAs: [SITE.instagram, SITE.facebook],
  hasMenu: `${SITE.url}/menu`,
  // No acceptsReservations field: "False" is true for tables (walk in) but
  // Google renders it as "Doesn't accept reservations" beside a site whose
  // Reserve page exists to book a room. Saying nothing is more honest.
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "11:00",
      // Midnight is "00:00" in schema.org, not "23:59". Every page posts a
      // 12:00 AM close and LiveStatus treats close as midnight; "23:59" made
      // Google render "Closes 11:59 PM", the exact hours contradiction this
      // build exists to kill.
      closes: "00:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Sunday",
      opens: "09:00",
      closes: "00:00",
    },
  ],
  potentialAction: {
    "@type": "OrderAction",
    target: {
      "@type": "EntryPoint",
      // orderUrl is absolute while ordering lives on Toast, relative when it
      // is the site's own /order page; either way this must stay absolute.
      urlTemplate: SITE.orderUrl.startsWith("http") ? SITE.orderUrl : `${SITE.url}${SITE.orderUrl}`,
      inLanguage: "en-US",
      actionPlatform: [
        "http://schema.org/DesktopWebPlatform",
        "http://schema.org/IOSPlatform",
        "http://schema.org/AndroidPlatform",
      ],
    },
    deliveryMethod: "http://purl.org/goodrelations/v1#DeliveryModePickUp",
  },
};

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a
        href="#main"
        className="display sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-sm focus:bg-copper focus:px-5 focus:py-3 focus:text-sm focus:uppercase focus:tracking-widest focus:text-ink"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(restaurantSchema) }} />
    </>
  );
}
