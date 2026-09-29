# Order confirmation dispatch and owner recovery

Verified locally September 17, 2026. Copper's in-house ordering remains a parked pitch demo; public ordering remains Toast. Mike's checkout is still demo/pay at pickup. This release does not enable live mail or establish operating readiness.

## Behavior

Accepted checkout already commits one email intent with the order and printer intent. The new worker claims that existing record under a PostgreSQL lease, stores the exact rendered message and idempotency key before sending, and records provider acceptance separately from delivery. A lost response retries the same saved bytes and key. A retry never creates a new confirmation reference. Leases last 60 seconds; requests time out after eight seconds. There are at most five attempts, starting with 30-second exponential backoff and honoring a longer provider retry delay. Sending stops 20 minutes after order creation. A separate 23-hour guard stays inside the provider key retention period.

Unattempted old/closed-order messages are suppressed. Uncertain attempts, changed provider credentials and legacy attempted records require owner review. A cancelled order never becomes fulfilled because of an email result. A message already in flight cannot be recalled. Late positive acknowledgements are retained; stale failures cannot erase provider acceptance. Audit writes and each state transition commit together, with network requests outside the transaction.

An owner sees up to 30 open records, review issues first, with recipient, attempts, provider reference and last observed event. Staff cannot access the inbox or its API. Run due confirmations processes at most two eligible sends and two provider lookups. Provider checks use GET only, including when outbound sending has been disabled. They distinguish provider acceptance, recipient mail-server acceptance, bounces and other observed states; none establishes that a person read the email. Scheduled checks cover records younger than seven days at a minimum 15-minute interval. This stores observed event changes, not a complete provider event stream.

Manual follow-up closes the email issue with a reason and current revision. It takes responsibility for follow-up without claiming delivery, changing fulfillment or changing money. The immutable review reference, result and audit record commit together. A lost save response can be checked or retried using that same reference. Pending controls lock and a stale review retains the note for another deliberate review. Browser recovery controls last only while the component remains mounted; the database receipt survives reload.

## Shared contracts

- notification-outbox 1.0.0: immutable message claims, bounded dispatch/check queues, PostgreSQL schema/history, revision checks and durable owner-review receipts. Requires existing ordering_orders/ordering_confirmations tables plus NOTIFICATION_SCHEMA, authenticated callers and dedicated READ COMMITTED transactions. Maintain order-before-confirmation lock ordering. Memory storage refuses physical sending/reviews.
- notification-provider 1.0.0: bounded Resend POST/GET adapters, fixed HTTPS destination, exact saved payload/key, classified failures and correlated provider IDs/recipient/subject/from. Imports notification-outbox from the same client directory.
- notification-request 1.0.0: owner labels and bounded correlated review/check requests. The caller retains the immutable command; no automatic browser retry. Type-only server imports are erased.

Clients keep their own pinned copies. Canonical modules live in separate version directories; the standalone test loader resolves their sibling contract without changing the shipped bytes. No older versioned component was edited.

## Configuration and rollout

Set ORDERING_EMAIL_ENABLED=true only after verifying persistent PostgreSQL, the intended sender and a monitored reply inbox. The service requires RESEND_API_KEY and INQUIRY_FROM, and uses SITE.email for replies. The key must permit sending and retrieving the relevant emails. Missing/disabled sending configuration leaves the intent stored; provider checking needs a key even when sending is disabled. Rotating that key holds previously uncertain attempts for review rather than risking a retry under another account.

A hosted scheduler may call GET /api/kitchen/notifications/dispatch with Authorization: Bearer followed by ORDERING_NOTIFICATION_SECRET (at least 32 characters). Use HTTPS and keep the secret out of URLs/source. Configure and monitor the scheduler on the intended host; none is created by this release. Copper's endpoint is restricted to its pitch host. Choose frequency/capacity for the two-message batch and 20-minute expiry; monitor backlog and errors. Owner Run due confirmations is a manual recovery action, not an always-running worker.

Back up storage, reconcile old attempted records, and deploy the matching schema/store/email/routes/UI/helpers together. Do not mix old pre-send-claim handlers with this worker. Refresh older kitchen pages. Sending remains opt-in; disabling it stops future claims but cannot recall an in-flight request. Existing order-acceptance, kitchen and printer source contracts are unchanged.

Resend documents [24-hour idempotency with identical payloads](https://resend.com/docs/dashboard/emails/idempotency-keys), [message retrieval](https://resend.com/docs/api-reference/emails/retrieve-email), [event meanings](https://resend.com/docs/dashboard/emails/manage-emails) and [error classifications](https://resend.com/docs/api-reference/errors). The finite retry policy is intentionally narrower than provider retention. It does not promise exactly-once email delivery or inbox placement.

## Verification and remaining gates

Sixteen client cases cover schema upgrade, overlapping workers, frozen replay, expired/terminal orders, changed credentials, retry limits, late acknowledgements, atomic audit rollback, persistent database restart, leased provider checks, durable owner review, bounded adapter responses, owner/staff authorization and scheduler credentials. Thirteen core/provider/browser-request cases also run standalone. All 86 Mike integration tests, 84 Copper integration tests and nine Copper host/readiness tests pass, as do the thirteen standalone cases, targeted ESLint and both isolated production Webpack/TypeScript builds.

An isolated production Next/PGlite browser fixture simulated provider acceptance followed by a lost response: two POST attempts produced one simulated email and recovered its provider ID. A later lost lookup response still displayed recipient mail-server acceptance. A delayed manual review locked controls; a response lost after commit recovered one saved review, preserving both synthetic orders' status/payment/amounts. Mike’s final-build owner review also saved one receipt without sending. Its 320px layout had no horizontal overflow and no browser console errors. Fixture tabs/servers were closed and build-generated TypeScript paths restored. No real email or provider call was made.

PGlite serializes local transactions. Hosted PostgreSQL/TLS and independent concurrent connections, deployment duration limits, verified sender/key permissions, actual inbox delivery/bounce handling, scheduler operation and owner handover remain unverified. History/frozen messages contain private customer data; retention, cleanup and a history browser/export UI remain open. No webhook or automatic outreach/follow-up messaging is included.

Run npm ci then npm test in glaze/assets/notification-tests. Client tests: node --test --test-isolation=none tools/workroom-tests/*.test.cjs. Run node glaze/scripts/verify-component-copies.mjs from the studio repo for source/manifest verification.
