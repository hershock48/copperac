import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

/**
 * The root: fonts, body, sitewide metadata. No chrome. The customer pages
 * get theirs from app/(site)/layout.tsx and the workroom gets its own from
 * app/workroom/layout.tsx, so neither inherits the other's header.
 */

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
    `A sports bar, not a gym. Detroit sports memorabilia, cold taps, burgers and Sunday brunch in downtown Marshall, Michigan. Order online or call ${SITE.phone}.`,
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
    images: [{ url: "/og/home.jpg", width: 1200, height: 630, alt: "Copper Athletic Club: a sports bar, not a gym. Downtown Marshall, Michigan." }],
  },
  twitter: {
    // Only the card type is set here. Title, description and image are
    // deliberately left off: sub-pages override openGraph but not twitter, so
    // repeating them at the root meant every inner page advertised the
    // homepage's title and image to any scraper that prefers twitter:*.
    card: "summary_large_image",
  },
  alternates: { canonical: "/" },
  // Icons come from app/favicon.ico and app/apple-icon.png via Next's file
  // conventions. The .ico carries 16/32/48; the two small sizes are a copper
  // C, because the buck's antlers break into loose pixels below about 40px.
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
