import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui";
import { HomeButton } from "@/components/HomeLink";

/**
 * AT THE ROOT, not inside app/(site). A not-found.tsx in a route group only
 * answers notFound() calls from pages in that group; a URL that matches no
 * route at all falls to app/not-found.tsx, and when that file did not exist
 * visitors got Next's bare white default, with the homepage title and
 * "404:" both in the head (found on the production 404, 20 Oct 2026, the
 * night before launch). The root layout has no chrome of its own, so the
 * header and footer are rendered here, the same two components the site
 * layout uses.
 */

// Without this the 404 inherits the root metadata, so it served the homepage's
// title, description and rel=canonical while returning a 404 status.
export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist at Copper Athletic Club.",
  robots: { index: false, follow: true },
  alternates: { canonical: undefined },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main">
        <section className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
          <p className="display text-xs uppercase tracking-[0.3em] text-copper-light">
            404
          </p>
          <h1 className="mt-5 text-4xl uppercase leading-tight text-cream sm:text-5xl">
            Wrong end of the bar
          </h1>
          <p className="mt-6 text-base leading-relaxed text-cream-dim">
            That page does not exist. The menu, the brunch spread and the Copper
            Reserve are all still right where you left them.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <HomeButton>Back Home</HomeButton>
            <Button href="/menu" variant="outline">
              See the Menu
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
