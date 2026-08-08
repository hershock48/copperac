"use client";

import { useState } from "react";
import { SITE } from "@/lib/site";

type Variant = "reserve" | "contact";

const fieldBase =
  "w-full rounded-sm border border-ink-line bg-ink px-4 py-3.5 text-base text-cream placeholder:text-cream-dim/40 transition-colors focus:border-copper focus:outline-none";

export default function InquiryForm({ variant }: { variant: Variant }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    // Demo stub. Wire to a route handler + Resend (or the client's inbox) at launch.
    await new Promise((r) => setTimeout(r, 500));
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-sm border border-copper/40 bg-ink p-10 text-center"
      >
        <p className="display text-2xl uppercase tracking-wide text-copper">
          Thanks, we got it
        </p>
        <p className="mt-4 text-base leading-relaxed text-cream-dim">
          {variant === "reserve"
            ? "Our events manager will get back to you within one business day. If your date is close, call us and we will sort it out right now."
            : "We will get back to you within one business day. For anything time-sensitive, give us a call."}
        </p>
        <a
          href={SITE.phoneHref}
          className="display mt-7 inline-block rounded-sm border border-copper px-6 py-3 text-sm uppercase tracking-widest text-copper-light transition-colors hover:bg-copper hover:text-white"
        >
          Call {SITE.phone}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="first" required />
        <Field label="Last name" name="last" required />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" name="email" type="email" required />
        <Field label="Phone" name="phone" type="tel" required />
      </div>

      {variant === "reserve" ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Type of event" name="eventType" placeholder="Birthday, fantasy draft, business meeting" />
            <Field label="Event date" name="date" type="date" />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Start time" name="start" type="time" />
            <Field label="End time" name="end" type="time" />
            <Field label="Guests" name="guests" type="number" placeholder="Up to 72" />
          </div>
        </>
      ) : (
        <Field label="Subject" name="subject" required />
      )}

      <div>
        <label htmlFor="message" className="display block text-xs uppercase tracking-[0.2em] text-cream-dim">
          {variant === "reserve" ? "Tell us about your event" : "Message"}
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          className={`${fieldBase} mt-2 resize-y`}
          placeholder={
            variant === "reserve"
              ? "Food options you are interested in, decorations, anything we should know."
              : "How can we help?"
          }
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="display w-full rounded-sm bg-copper px-7 py-4 text-sm uppercase tracking-widest text-white transition-colors hover:bg-copper-light disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Sending…" : variant === "reserve" ? "Request the Space" : "Send Message"}
      </button>

      <p className="text-xs text-cream-dim/60">
        We reply within one business day. Prefer to talk it through?{" "}
        <a href={SITE.phoneHref} className="text-copper-light underline underline-offset-4">
          {SITE.phone}
        </a>
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="display block text-xs uppercase tracking-[0.2em] text-cream-dim">
        {label}
        {required && (
          <span className="ml-1 text-copper" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className={`${fieldBase} mt-2`}
      />
    </div>
  );
}
