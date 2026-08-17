import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SITE } from "@/lib/site";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-oswald",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Copper Athletic Club | Sports Bar in Marshall, MI",
    template: "%s | Copper Athletic Club",
  },
  description:
    "A sports bar, not a gym. Detroit sports memorabilia, cold taps, burgers and Sunday brunch in downtown Marshall, Michigan. Order online or call (269) 558-8222.",
  keywords: [
    "sports bar Marshall MI",
    "Copper Athletic Club",
    "Marshall Michigan restaurant",
    "Sunday brunch Marshall MI",
    "private event space Marshall MI",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE.url,
    siteName: SITE.name,
    title: "Copper Athletic Club | Sports Bar in Marshall, MI",
    description:
      "A sports bar, not a gym. Detroit sports memorabilia, cold taps, burgers and Sunday brunch in downtown Marshall, Michigan.",
    // Designed share card, not a raw photo: 1200x630 (the ratio every scraper
    // crops to) and JPG, because some previewers still won't render WebP.
    // The Restaurant schema below keeps pointing at real photography, which is
    // what Google actually wants there.
    images: [{ url: "/og/home.jpg", width: 1200, height: 630, alt: "Copper Athletic Club: a sports bar, not a gym. Downtown Marshall, Michigan." }],
  },
  twitter: {
    // Only the card type is set here. Title, description and image are
    // deliberately left off: sub-pages override openGraph but not twitter, so
    // repeating them at the root meant every inner page advertised the
    // homepage's title and image to any scraper that prefers twitter:*.
    // Absent twitter:* tags fall back to og:*, which is per-page and correct.
    card: "summary_large_image",
  },
  alternates: { canonical: "/" },
  // Icons come from app/favicon.ico and app/apple-icon.png via Next's file
  // conventions. The old declaration pointed both at a 192px transparent PNG,
  // so /favicon.ico 404'd on every visit and iOS scaled a 192 down to 180.
  // The .ico carries 16/32/48; the two small sizes are a copper C, because the
  // buck's antlers break into loose pixels below about 40px.
};

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
  acceptsReservations: "False",
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      opens: "11:00",
      closes: "23:59",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Sunday",
      opens: "09:00",
      closes: "23:59",
    },
  ],
  potentialAction: {
    "@type": "OrderAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE.url}${SITE.orderUrl}`,
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable}`}>
      <body>
        <a
          href="#main"
          className="display sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-sm focus:bg-copper focus:px-5 focus:py-3 focus:text-sm focus:uppercase focus:tracking-widest focus:text-ink"
        >
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantSchema) }}
        />
      </body>
    </html>
  );
}
