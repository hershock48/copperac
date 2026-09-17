# Kitchen actions and recovery — 1.0.0

Verified locally September 17, 2026 in Mike's Place and Copper's parked ordering demo. Copper's customers still order through Toast. These checks do not certify an installed deployment or physical printer.

## Behavior

Availability, busy time, pause, acceptance, pickup and owner cancellation require the revision the operator actually saw. Each action has one immutable request and UUID. PostgreSQL compares the complete saved record and commits the accepted change, receipt and before/after history in one statement. A stale device receives a durable rejection; it cannot overwrite an intervening change. Replaying the same request returns its existing result. Reusing the reference with another body is rejected, including simultaneous requests affecting different records.

The board freezes changes while saving. After a timeout or lost response, Check action result reads the receipt and Retry same action resubmits the unchanged request. It never silently retries, removes an order optimistically, or applies an old receipt over a newer polled board. Availability is an explicit desired value rather than a toggle. Expiring pauses retain the saved revision and cannot defeat conflict checks.

New orders can be accepted; accepted orders can be marked picked up. An owner can cancel a new or accepted order with a reason. Staff cannot cancel. Completed or cancelled orders cannot reopen through these controls. Cancellation preserves the paid flag, totals and provider fields, stops queued print jobs atomically, and records the reason and timestamp. It does not refund money or send an email. The owner must contact the guest and handle any payment through the actual register/provider. The customer sees Order cancelled, without a refund claim, and can start another order. Picked-up orders show their final status and total without claiming payment is still due.

## Shared source

- kitchen-operations 1.0.0: validated commands, record revisions, permitted transitions, immutable receipts, atomic SQL and development-memory adapters. Uses Node crypto. Requires ordering_state, ordering_orders, ordering_print_jobs and OPERATION_SCHEMA. The caller supplies authenticated roles, initializes persistent storage, parses input and fingerprints the complete request. Audit actors are roles, not named people.
- kitchen-request 1.0.0: a single bounded PATCH or receipt GET and correlated terminal/unknown response validation. The caller retains the immutable request, locks pending fields, preserves drafts and refreshes saved records. It does not persist recovery across reload or tab closure.

Both client repositories retain their own source files in lib/ordering. Their .glazed/components.json manifests and the studio catalog pin the immutable source commit and LF-normalized SHA-256; deployment is recorded separately.

## Verification

Eleven additional client tests cover strict commands, explicit availability, expiry/ABA conflicts, immutable memory adapters, roles/transitions, paid-field preservation, SQL races, changed-body reference collisions, cancellation/print/history rollback, database close/reopen, service authentication/storage/validation/replay and bounded client requests. Mike's full suite passes 55 tests; Copper's passes 45 integration tests and nine launch tests. Both production Webpack/TypeScript builds and targeted lint pass. The standalone canonical suite passes six tests.

Run npm ci and npm test in glaze/assets/kitchen-operations-tests in the studio repository; in either client run npm ci --prefix tools/workroom-tests then npm test --prefix tools/workroom-tests. Copper additionally runs node --test --test-isolation=none lib/__tests__/launch-readiness.cjs. Source consistency is checked by node glaze/scripts/verify-component-copies.mjs in the studio repository.

Isolated production Next/PGlite browser checks used fake credentials, synthetic guests/payment flags, and no mail/payment provider. Both boards locked pending actions and recovered a saved action after losing its response without another effect. Mike's rejected an intervening state edit, recovered a cancelled paid fixture by the same reference, and carried customer orders through cancellation and pickup. Copper preserved the synthetic paid flag and total when cancelled, and its customer saw the cancelled state and returned to a fresh order. Recovery controls fit a 320px viewport. PGlite tests exercise real PostgreSQL statements on a local serialized connection; intended-host multi-connection behavior still needs verification.

## Rollout and remaining work

Deploy the matching board, customer status page, routes, service, store/schema and shared helpers together. Older open boards lack revisions and must refresh. Back up storage and verify schema permissions, actual PostgreSQL/TLS configuration, concurrent devices, restart, signed roles and owner handover. Production kitchen mutations refuse volatile memory storage. Receipts contain order snapshots/contact data and must remain private; establish a retention policy that preserves references while retries may still arrive.

Recovery references and unsaved cancellation reasons stay in the mounted page only. Reload or tab closure loses them; inspect the refreshed board before acting again. History is durable in the database, but this release has no browsable kitchen history or cancelled-order recovery screen. A cancellation cannot recall a ticket already fetched or printed.

Printer acknowledgement now uses guarded order acceptance and cannot reopen a cancelled order. The existing printer protocol still chooses the next queued job on acknowledgement instead of binding acknowledgement to the served job; acknowledgement and order acceptance are not one transaction. Duplicate acknowledgements, defaults for missing printer codes and physical print recovery remain open. Do not claim reliable physical fulfillment from queued intent.

Email intent/initial attempts still need a dispatcher, provider acceptance references and reconciliation; attempted is not delivered. Copper's separate parked ordering-menu editor still needs its own conflict/history/draft-save review. Real provider payments/refunds, hosted rollout, physical printing, actual inbox delivery and owner acceptance are not certified by these source tests.
