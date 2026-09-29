# Durable submission recovery — 1.0.0

The order-acceptance server component and order-recovery client component are adopted in Mike's Place and Copper's parked ordering demo. They prevent retries of the same submission from creating another order. Copper's public ordering remains Toast; no card payment adapter is introduced.

## Result contract

- A checkout generates a random UUID reference and keeps that reference in tab session storage before sending. The request includes its reviewed prices. Contact details and the exact retry body stay in memory; they are not saved in browser storage.
- The server binds a canonical SHA-256 request fingerprint to one recorded result: accepted, rejected or cancelled. Replays return that result before checking changed prices, opening hours or sold-out state. A changed request with the same reference is refused. A reviewed correction uses a new reference after the old one has settled.
- A single PostgreSQL statement inserts the winning attempt, order, all configured print jobs and a confirmation-email intent. A failed print/email-intent insert rolls back all of them. A conflicting statement reads the committed winner in a new statement, avoiding an old snapshot. Ticket sequences can have gaps after races/rollbacks and do not reset daily.
- A lost, timed-out or malformed response keeps the cart and contact draft locked. Check order result is read-only. Retry this submission sends the same reference and immutable body. Stop submission and return records a terminal stop if no order won; delayed requests cannot subsequently accept that reference. If an order already won, stopping returns its receipt and does not cancel it.
- After reload, the opaque reference restores the recovery screen. The recorded receipt can be recovered, or a still-unaccepted submission can be stopped. Unsaved cart/contact fields and the retry body do not survive reload. Closing the tab or clearing session storage can lose the reference; the UI does not claim browser storage is a durable customer record.
- References act as unguessable receipt/recovery tokens. APIs return no guest name, phone or email, and use no-store responses. Request bodies are limited to 64 KiB and nested fingerprint input is bounded. Attempt/result records must not be deleted while delayed requests or customer retries may still use them.

## Storage and rollout

Ordering now shares schema initialization per process, retries failed initialization, closes failed pools, uses configured/default pg TLS behavior and a seven-second connection timeout, and refuses ambiguous prefixed database URLs. All production memory mutations are rejected, including kitchen writes. Explicit DATABASE_URL or POSTGRES_URL remains the chosen connection. No connection secrets are published.

Deploy the matching order/recovery routes, client, helpers, schema/store and email timeout together. Older checkout pages without a submission reference must refresh. Additive tables ordering_attempts and ordering_confirmations require migration permissions; verify and back up on the intended host. Owner menu snapshots are fresh when read but are not locked through acceptance.

## Notification and operating limits

Email intent commits with the order. Only the winner may claim its initial courtesy send; queued means that claim has not happened, and attempted means a send may have happened. Neither state certifies delivery. An eight-second transport timeout bounds that courtesy attempt. Lost responses and order retries do not resend it.

A reviewed dispatcher/reconciliation workflow for queued or ambiguous email intents is still required, including provider idempotency/acceptance evidence and owner recovery controls. Printer jobs are atomically queued, but physical print acknowledgement/retry semantics are not certified. Kitchen signed access, throttling, concurrent state, legal status transitions, cancellation/refund correctness, abuse limits/retention and owner fulfillment handover remain open. No real payment, refund, message or live deployment was performed during verification.

## Verification

Run npm ci and npm test in glaze/assets/order-acceptance-tests for the five canonical suites (memory finality, fingerprint/input limits, client recovery, SQL rollback and database restart). Run the copy verifier in the studio and node --test --test-isolation=none tools/workroom-tests/*.test.cjs in each client, plus lint and a production Webpack/TypeScript build.

September 17: 35 Mike and 24 Copper client tests pass, including simultaneous retries, payload mismatch, price rejection, a stop racing a delayed handler, post-commit response failure, atomic fanout rollback, close/reopen persistence and storage initialization failures. Both production builds pass. Browser fixtures using actual production Next routes and an isolated PGlite adapter recovered Mike's saved order after a lost response with the database count unchanged, retained fields after stopping an unaccepted submission, and recovered a second order after reload. Copper returned the original receipt when stopping a submission that had already committed. Fixture mail/printers were disabled.

PGlite serializes a local connection. These checks do not replace intended-host multi-connection PostgreSQL, TLS/migrations, provider/inbox, physical printer or owner-device verification.
