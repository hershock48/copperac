import type { Metadata } from "next";
import { Button } from "@/components/ui";

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
    <section className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
      <p className="display text-xs uppercase tracking-[0.3em] text-copper-light">404</p>
      <h1 className="mt-5 text-4xl uppercase leading-tight text-cream sm:text-5xl">
        Wrong end of the bar
      </h1>
      <p className="mt-6 text-base leading-relaxed text-cream-dim">
        That page does not exist. The menu, the brunch spread and the Copper Reserve are all
        still right where you left them.
      </p>
      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <Button href="/">Back Home</Button>
        <Button href="/menu" variant="outline">
          See the Menu
        </Button>
      </div>
    </section>
  );
}
