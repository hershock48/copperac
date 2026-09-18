# Intake trace: contact and reserve, 2026-09-17

Backlog item B4. Every step a guest enquiry takes from the public form to the
owner reading it, written from the code on `claude/takeover-copperac` at
7ac3b5c, with file and line. Nothing here is aspirational. Where a step does
not exist, it says so.

Two public intake surfaces post to one route. There is no third.

| Surface | Page | Component | Variant |
| --- | --- | --- | --- |
| Contact | `app/(site)/contact/page.tsx:107` | `InquiryForm` | `contact` |
| Reserve (private room) | `app/(site)/reserve/page.tsx:244` | `InquiryForm` | `reserve` |

The events page has no form of its own. `app/(site)/events/page.tsx:82-89`
builds an "Ask <name> about events" `mailto:` from the owner-edited contact
block, and `:114` and `:181` send visitors to `/reserve`. That mailto never
touches the route below, so an event request either arrives as a reserve
submission or as a direct email the site never sees.

## 1. The form

`components/InquiryForm.tsx`

- `:52` `onSubmit` reads the form with `FormData` and trims every value.
- `:62-66` POSTs JSON `{ variant, ...fields }` to `/api/inquiry`.
- `:169-175` the submit button carries `disabled={busy}`. This is the only
  duplicate-submit guard on the whole path and it lives in the browser.
- `:68-71` the success panel renders only when `res.ok && json.ok` are both
  true. There is no timer, no optimistic path.
- `:75-84` a 422 renders an inline message and deliberately does not hand off
  to the mail app, because the same too-long or malformed content would open
  in it with no explanation.
- `:87-90` every other non-success answer sets `window.location.href` to a
  prefilled `mailto:` addressed to `SITE.email` and shows the handoff note.
- `:91-95` a thrown `fetch` does the same.

## 2. The route

`app/api/inquiry/route.ts`, `POST` at `:60`. In order:

| Step | Line | Refusal |
| --- | --- | --- |
| `request.json()` | `:62-66` | 400 `bad_request` |
| body is object, not null, not array | `:69-71` | 400 `bad_request` |
| read, strip C0 controls and DEL, trim | `:76-79` | none, sanitizing only |
| per-field ceiling | `:81-89` | 422 `too_long` plus the field name |
| `first`, `last`, `email`, `phone` present | `:91-94` | 422 `missing_fields` |
| email shape | `:95-97` | 422 `bad_email` |
| `RESEND_API_KEY` and `INQUIRY_FROM` set | `:99-107` | 503 `not_configured`, logged |
| Resend accepts | `:136-145` | 502 `provider_error` plus status, logged with Resend's body |
| Resend returned a string `id` | `:146-149` | 502 `provider_error` |
| the call completed at all | `:150-153` | 502 `network_error`, logged |
| otherwise | `:155` | 200 `{ ok: true }` |

Ceilings are `message` 4000 characters and everything else 200
(`:57-58`). The control-character strip at `:78` is what stops a guest
smuggling a line break into the subject built at `:110-113`. Its class is
U+0000 to U+001F plus U+007F, which is C0 and DEL. C1, U+0080 to U+009F,
is not stripped, and nothing is open on that: a header break needs CR or
LF and both are C0.

The subject is `Copper Reserve enquiry: <type> on <date>` for reserve and
`Website enquiry: <subject>` for contact (`:110-113`). The text body is one
labelled line per non-empty field plus a provenance line naming the page
(`:115-118`).

## 3. What is persisted

Nothing. There is no inquiry table, no row, no file, no queue.
`lib/workroom/store.ts:149` declares exactly three JSON tables
(`workroom_content`, `workroom_events`, `workroom_images`) plus
`copper_login_attempts` at `:175`. None of them holds an enquiry. The route
never imports the store.

The only durable record of a guest enquiry is the message sitting in the
club's mailbox and the `[inquiry]` refusal lines in the Vercel runtime log.
If Resend accepts and the mail is later filtered or deleted, the site holds
no copy.

## 4. The email

One Resend call, `app/api/inquiry/route.ts:121-135`.

- Endpoint `https://api.resend.com/emails`, bearer `RESEND_API_KEY`.
- `from` is `INQUIRY_FROM`, on the shared verified `glazedweb.com` domain,
  because we do not hold copperac.com DNS (README, "Destination").
- `to` is `INQUIRY_TO`, falling back to `SITE.email`, which is
  `reserve@copperac.com` (`lib/site.ts:41`).
- `reply_to` is the guest's own address, so the club hits reply and the
  reply reaches the guest rather than our sending domain.
- Env values are trimmed on read (`:99-101`) so a pasted key with a trailing
  space still works.
- Timeout is `AbortSignal.timeout(12000)` (`:123`).

Idempotency: **none today**. The call carries no `Idempotency-Key` header and
the route holds no memory of a previous submission. Two POSTs with identical
content produce two Resend accepts and two emails in the club's inbox. See
the duplicate row in section 5.

Acceptance is not delivery. A 200 from Resend with an id means Resend took
the message. Bounce, spam filing and the club's own rules are invisible to
the route and to the guest, who has already been told "Thanks, we got it".

## 5. Failure by failure

| Failure | What actually happens | Guest sees |
| --- | --- | --- |
| Provider down or refusing (bad key 401, unverified From 403, 5xx) | `:136-145` logs Resend's status and body, returns 502 `provider_error`. Nothing is retried, nothing is queued. | Mail app opens prefilled, plus the on-screen note and the phone number (`InquiryForm.tsx:87-90`) |
| Provider unreachable, DNS or TLS failure | `:150-153` returns 502 `network_error` | Same mail-app handoff |
| The 12 second abort | `AbortSignal.timeout(12000)` at `:123` rejects the fetch with a `TimeoutError`, which lands in the same catch at `:150` and answers 502 `network_error`. The route cannot tell an abort from a socket failure, and the log line reads the same. Whether Resend accepted the message before the abort is unknowable from here, so a slow accept can produce both a delivered email and a mail-app handoff. | Same mail-app handoff, with the risk of a second copy if they use it |
| Storage down | No effect on intake. The route never touches Postgres. A dead database takes the workroom and the events page's owner-edited contact block, not this form. | Nothing |
| Duplicate submit | Two emails. `disabled={busy}` (`InquiryForm.tsx:171`) stops a double-click in one live tab and nothing else: back-and-resubmit, a second tab, a refresh of a POSTed form, or a mail-app handoff after a slow accept all send again. | "Thanks, we got it" both times |
| Malformed body (not JSON, or JSON `null`/array/string/number) | 400 `bad_request` at `:65` or `:70`. The array and scalar guard at `:69-71` is load-bearing; without it `fields[k]` would throw and the handler would 500. | Mail-app handoff, because 400 is not 422 |
| Oversized field | 422 `too_long` naming the field (`:84-89`) | Inline message telling them the two ceilings |
| Oversized raw body | **Unbounded before the ceiling check.** `request.json()` at `:63` buffers and parses the whole payload before any length is measured, and App Router route handlers apply no body-size limit of their own. A megabyte of JSON is fully parsed, then refused with 422 or 400. The ceiling protects our sending reputation, not the function's memory. | 422 or 400 |
| Repeated automated submissions | No rate limit of any kind. `lib/workroom/ratelimit.ts` and `lib/workroom/login-limit.ts` gate the owner and kitchen doors only. `/api/inquiry` is unauthenticated and will relay every well-formed submission through our shared glazedweb.com sender. | Success each time |

## 6. What the owner can do

The workroom is `/workroom`. `components/workroom/Chrome.tsx:11-16` lists its
whole navigation: Events, Menu, and a Taps handoff link.

- **View an enquiry:** not in the workroom. Only in `reserve@copperac.com`.
- **Archive an enquiry:** not in the workroom. Whatever their mail client
  does. The archive control at `components/workroom/EventsScreen.tsx:272`
  archives the club's own published events, not guest requests.
- **Reply:** in the mail client. `reply_to` (`route.ts:131`) is set to the
  guest, so a plain reply reaches them from the club's own address.
- **Mark it handled, assign it, see what is outstanding:** none of these
  exist anywhere in the codebase.

What the owner can do in the workroom that touches intake at all is edit the
events contact block (`app/api/workroom/events/contact/route.ts:10`, key
`EVENTS_CONTACT_KEY` at `lib/content.ts:28`), which changes the name and
address behind the events page's "Ask" button. That write is revision
checked and 409s on a stale window (`:18`).

## 7. Host gate over the intake path

`/api/inquiry` is not parked. It answers on every host, which is correct: the
client site needs its own contact form.

The parked in-house ordering platform is gated in `proxy.ts:26-58`, matched
by `proxy.ts:61-73`. On any host other than `copperac.glazedweb.com`:
`/kitchen`, `/kitchen/*` and `/pitch/*` 307 to `/`, and `/api/ordering/*`,
`/api/kitchen/*` and `/api/printer` return 404. The guest `/order` page is
parked separately in `next.config.ts:43-48`, redirecting to Toast everywhere
except the pitch host. Toast stays the customer ordering path.

## 8. Findings

1. Nothing about an enquiry is persisted by the site. The mailbox is the
   system of record and the runtime log is the only trace of a refusal.
2. There is no idempotency anywhere on the send. A duplicate submit is a
   duplicate email, and the 12 second abort can produce a duplicate on its
   own when a slow Resend accept is followed by the mail-app handoff.
3. The workroom has no inbox. View, archive and reply all happen in the
   club's mail client, so B4's "owner access" is satisfied by
   `reply_to` and nothing else.
4. `/api/inquiry` has no rate limit and no raw body ceiling. Both are
   exposures of our shared sending identity, not of the club's data.
5. Test coverage before this pass ran one inquiry case (provider acceptance
   id, `lib/__tests__/launch-readiness.cjs:90-99`) and enumerated parked API
   paths by hand, missing `/api/ordering/state`, `/api/kitchen/login` and
   `/api/kitchen/state`.

Items 1, 3 and 4 are described, not changed. Item 1 is a product decision for
Kevin: an inbox in the workroom is a build, not a fix. Item 4 needs durable
storage the workroom already requires, and is worth doing with the same
`copper_login_attempts` table rather than a per-instance counter.

## 9. What this branch changed after the trace

Sections 1 to 7 describe the code as it was when the trace was written. Two
of them have moved since.

- **Section 4, idempotency.** The Resend call now carries an
  `idempotency-key` header built from a SHA-256 of the variant, the
  destination, the subject and the message text
  (`app/api/inquiry/route.ts`). Resend holds a key for 24 hours and replays
  its original answer, so a duplicate submit is one email in the club's
  inbox and still a success panel for the guest. A genuinely different
  enquiry hashes differently and sends.
- **Section 5, duplicate submit row.** Two identical POSTs are now one
  email, and the abort's "two copies" risk shrinks to the mail-app fallback,
  which is the guest writing from their own address and cannot be deduped
  from here.
- **Finding 5, coverage.** `lib/__tests__/launch-readiness.cjs` now covers
  the happy path for both variants, control characters in the subject, the
  duplicate key, every refusal (unconfigured, malformed, oversized, missing,
  bad email, provider error, no acceptance id) and the 12 second ceiling by
  the number. The parked API paths are read off disk instead of listed by
  hand, and the host gate is asserted against the proxy matcher as well as
  the handler.

Findings 1, 3 and 4 are unchanged and still open.
