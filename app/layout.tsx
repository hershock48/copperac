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
    images: [{ url: "/img/interior-wide.webp", width: 1920, height: 1080, alt: SITE.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Copper Athletic Club | Sports Bar in Marshall, MI",
    description:
      "A sports bar, not a gym. Detroit sports memorabilia, cold taps, burgers and Sunday brunch in downtown Marshall, Michigan.",
    images: ["/img/interior-wide.webp"],
  },
  alternates: { canonical: "/" },
  icons: { icon: "/img/icon.png", apple: "/img/icon.png" },
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
      urlTemplate: SITE.orderUrl,
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
          className="display sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-sm focus:bg-copper focus:px-5 focus:py-3 focus:text-sm focus:uppercase focus:tracking-widest focus:text-white"
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
