import Image from "next/image";
import Link from "next/link";
import { HOURS, KITCHEN_NOTE, NAV, SITE } from "@/lib/site";
import GlazedCredit from "@/components/GlazedCredit";

export default function Footer() {
  return (
    <footer className="border-t border-ink-line bg-ink-soft">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Image
              src="/img/logo.png"
              alt={SITE.name}
              width={512}
              height={256}
              className="h-14 w-auto"
            />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-cream-dim/70">
              A shrine to Michigan sports in the heart of downtown Marshall, built on the
              bones of the old Copper Bar.
            </p>
            <div className="mt-6 flex gap-3">
              <SocialLink href={SITE.instagram} label="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </SocialLink>
              <SocialLink href={SITE.facebook} label="Facebook">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.5l.5-3H13v-2c0-.6.4-1 1-1Z" />
                </svg>
              </SocialLink>
            </div>
          </div>

          <div>
            <h2 className="display text-sm uppercase tracking-[0.2em] text-copper-light">Visit Us</h2>
            <address className="mt-5 space-y-3 text-sm not-italic leading-relaxed text-cream-dim">
              <p>
                {SITE.street}
                <br />
                {SITE.city}, {SITE.state} {SITE.zip}
              </p>
              <p>
                <a href={SITE.phoneHref} className="transition-colors hover:text-copper-light">
                  {SITE.phone}
                </a>
              </p>
              <p>
                <a href={`mailto:${SITE.email}`} className="transition-colors hover:text-copper-light">
                  {SITE.email}
                </a>
              </p>
            </address>
            <a
              href={SITE.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-copper-light underline underline-offset-4 hover:text-copper"
            >
              Get directions
            </a>
          </div>

          <div>
            <h2 className="display text-sm uppercase tracking-[0.2em] text-copper-light">Hours</h2>
            <dl className="mt-5 space-y-3 text-sm text-cream-dim">
              {HOURS.map((h) => (
                <div key={h.label}>
                  <dt className="text-cream">{h.label}</dt>
                  <dd className="text-cream-dim/70">{h.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-cream-dim/60">{KITCHEN_NOTE}</p>
          </div>

          <div>
            <h2 className="display text-sm uppercase tracking-[0.2em] text-copper-light">Explore</h2>
            <ul className="mt-5 space-y-3 text-sm text-cream-dim">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition-colors hover:text-copper-light">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={SITE.orderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-copper-light"
                >
                  Order Online
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-ink-line pt-8 text-xs text-cream-dim/70 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </p>
          {/* Was "Site by Glazed Web" as plain text pointing at the NON-www host, which
              301s on every click. Now the shared component: warmer register, the mark beside
              it, and the canonical URL. */}
          <GlazedCredit line="Double dipped by" />
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-ink-line text-cream-dim transition-colors hover:border-copper hover:text-copper"
    >
      {children}
    </a>
  );
}
