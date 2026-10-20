import type { Metadata } from "next";
import localFont from "next/font/local";
import { SITE } from "@/lib/site";
import "./globals.css";

/**
 * The root: fonts, body, sitewide metadata. No chrome. The customer pages
 * get theirs from app/(site)/layout.tsx and the workroom gets its own from
 * app/workroom/layout.tsx, so neither inherits the other's header.
 *
 * THE FONTS ARE IN THE REPO, not fetched from Google at build time. Until
 * 20 Oct 2026 they came through next/font/google, which downloads the
 * files during `next build`; that day a Vercel production build with no
 * cache failed on exactly that download, surfacing as fifteen Turbopack
 * "Module not found: @vercel/turbopack-next/internal/font/google/font"
 * errors, on a commit that had built green an hour earlier with the
 * cache warm. The same commit built fine here on Node 22 and Node 24 with
 * a cold cache and Google reachable, so the failure was the fetch, not
 * the code. A build that can fail on a third party's availability is a
 * launch-day risk, so the two latin files (the same woff2 Google serves:
 * Oswald variable 200 to 700, Inter variable 100 to 900, both under the
 * SIL Open Font License) live in app/fonts/ and next/font/local serves
 * them the same way, same CSS variables, nothing else on the site changed.
 */

const oswald = localFont({
  src: "./fonts/oswald-latin.woff2",
  weight: "200 700",
  variable: "--font-oswald",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
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
    `A Detroit sports bar in downtown Marshall, Michigan: memorabilia on every wall, cold taps, burgers and Sunday brunch. Order online or call ${SITE.phone}.`,
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
      "A Detroit sports bar in downtown Marshall, Michigan: memorabilia on every wall, cold taps, burgers and Sunday brunch.",
    // Designed share card, not a raw photo: 1200x630 (the ratio every scraper
    // crops to) and JPG, because some previewers still won't render WebP.
    images: [{ url: "/og/home.jpg", width: 1200, height: 630, alt: "Copper Athletic Club, a Detroit sports bar in downtown Marshall, Michigan." }],
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
