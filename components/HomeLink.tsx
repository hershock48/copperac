"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui";

/**
 * Where "home" is. On the client's own hosts it is "/". On the pitch host
 * (copperac.glazedweb.com) "/" is the proposal, not the site, so a visitor
 * walking the demo who taps the logo would land on our sales document
 * instead of the bar's homepage (Kevin, 8 Sep 2026). There, home is /demo.
 *
 * Read from the browser's own hostname through useSyncExternalStore, with
 * "/" as the server snapshot: the first paint matches the server, the
 * pitch host corrects itself before anyone can tap, and no effect sets
 * state (the hooks lint rule). The anchor repo's HomeLink, ported.
 */
const PITCH_HOST = "copperac.glazedweb.com";
const subscribe = () => () => {};

export function useHomeHref(): string {
  return useSyncExternalStore(
    subscribe,
    () => (window.location.hostname === PITCH_HOST ? "/demo" : "/"),
    () => "/"
  );
}

/** The site's Button, pointed home, for server pages that cannot use the hook. */
export function HomeButton({ children }: { children: React.ReactNode }) {
  const href = useHomeHref();
  return <Button href={href}>{children}</Button>;
}

/** A Link whose href is home, wherever home is on this host. */
export default function HomeLink({
  className,
  children,
  ...rest
}: Omit<React.ComponentProps<typeof Link>, "href">) {
  const href = useHomeHref();
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
