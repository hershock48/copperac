"use client";

import { usePathname } from "next/navigation";
import { SITE } from "@/lib/site";

/**
 * The workroom's header. A tool bar, small and dense, never scrolls away.
 * Lifted from anchor's Chrome: one nav, a boundary slash in the active test.
 */
const TABS = [
  { href: "/workroom", label: "Events" },
  { href: "/workroom/menu", label: "Menu" },
];

export default function WorkroomChrome() {
  const path = usePathname() || "/workroom";
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  async function lock() {
    await fetch("/api/workroom/logout", { method: "POST" });
    window.location.href = "/workroom";
  }

  return (
    <header className="wr-chrome">
      <div className="wr-chrome-in">
        <a className="wr-brand" href="/workroom">
          <span className="wr-shop">{SITE.name}</span>
          <span className="wr-word">Workroom</span>
        </a>
        <nav className="wr-tabs" aria-label="Workroom">
          {TABS.map((t) => (
            <a key={t.href} href={t.href} aria-current={isActive(t.href) ? "page" : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="wr-right">
          <a href="/events" target="_blank" rel="noreferrer">
            The site <span aria-hidden="true">↗</span>
          </a>
          <button type="button" onClick={lock}>
            Lock
          </button>
        </div>
      </div>
    </header>
  );
}
