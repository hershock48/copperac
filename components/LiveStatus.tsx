"use client";

import { useEffect, useState } from "react";
import { KITCHEN_NOTE } from "@/lib/site";

/**
 * Live open / kitchen indicator.
 *
 * Fixes the real problem the current site has: the page says one thing, the
 * Toast ordering page says another, and guests find out the kitchen closed by
 * showing up. Hours here mirror lib/site.ts — bar till midnight, kitchen till
 * ten, Sunday opens at nine.
 *
 * Renders nothing on the server so the markup can't ship a stale "Open now",
 * then fills in on mount and re-checks every minute.
 */

type State = {
  label: string;
  detail: string;
  tone: "open" | "kitchen-closed" | "closed";
};

function compute(now: Date): State {
  // Evaluate in Detroit time regardless of the visitor's timezone.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const hour = parseInt(get("hour"), 10) % 24;
  const minute = parseInt(get("minute"), 10);
  const mins = hour * 60 + minute;

  const isSunday = weekday === "Sun";
  const open = isSunday ? 9 * 60 : 11 * 60; // 9:00 AM Sunday, 11:00 AM otherwise
  const close = 24 * 60; // midnight
  const kitchenClose = 22 * 60; // 10:00 PM

  if (mins < open) {
    const h = isSunday ? "9:00 AM" : "11:00 AM";
    return { label: "Closed", detail: `Opens at ${h}`, tone: "closed" };
  }
  if (mins >= close) {
    return { label: "Closed", detail: "Opens tomorrow", tone: "closed" };
  }
  if (mins >= kitchenClose) {
    return { label: "Bar open", detail: "Kitchen closed for the night", tone: "kitchen-closed" };
  }
  return { label: "Open now", detail: KITCHEN_NOTE.replace(/\.$/, ""), tone: "open" };
}

export default function LiveStatus({ className = "" }: { className?: string }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    const tick = () => setState(compute(new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!state) {
    // Reserve the space so nothing shifts when it appears.
    return <span className={`status-chip status-chip-idle ${className}`} aria-hidden="true" />;
  }

  return (
    <span className={`status-chip status-${state.tone} ${className}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      <b>{state.label}</b>
      <span className="status-sep">·</span>
      <span className="status-detail">{state.detail}</span>
    </span>
  );
}
