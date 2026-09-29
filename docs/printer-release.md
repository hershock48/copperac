# Printer job confirmation and owner review

Verified locally September 17, 2026. Copper's in-house ordering remains a parked pitch demo and public ordering remains Toast. Mike's ordering adapter is still demo/pay at pickup. These changes do not establish live readiness.

## Result

Printer GET and DELETE use the exact announced job UUID. Repeated fetches return the same ticket; repeated matching results return the existing result without advancing another order. A success requires a prior fetch and an explicit result code. Missing codes are rejected. Printer result, kitchen acceptance and audit history commit in one PostgreSQL transaction. A front slip never accepts an order; terminal orders stay terminal and payment fields are preserved.

Only queued, unfetched tickets expire after 20 minutes, separately for each device. A fetched ticket with no matching confirmation holds that printer's queue. Heartbeat/status is shown separately from paper confirmation. Busy/offline polls do not clear uncertainty. Expired/failed tickets and held tickets appear on the board, with up to 20 held/oldest issues first; resolving issues reveals the next records.

An owner can record a physical paper check, close a print issue while handling the order on screen, or queue a clearly marked replacement for an open order. Every review requires the observed job revision, a reason and immutable action UUID. The job, optional replacement, optional kitchen acceptance, before/after history and receipt commit together. Same-action retries return the saved result. Stale reviews are rejected. A delayed old confirmation cannot affect a replacement. The owner must stop/clear the old device job before reprinting; software cannot recall paper and cannot promise exactly one physical copy.

## Shared contracts

- printer-jobs 1.0.0: Node crypto, strict poll/review parsing, job transitions, per-device locks, explicit SQL transactions, schema migration, durable review receipts/history and issue summaries. Initialize existing ordering_orders, ordering_print_jobs and ordering_printers tables plus PRINT_SCHEMA. Supply a dedicated PostgreSQL READ COMMITTED transaction connection and authenticated printer/owner identity. Maintain order-before-job lock order when adding writers.
- printer-review 1.0.0: bounded POST/result GET with complete command correlation. The caller holds the immutable request, prevents double submission and refreshes the board after resolution. No automatic retry. Type imports are erased; no server crypto enters the browser bundle.

Clients retain independent source copies and pinned manifests. Source verification and deployed versions are separate ledger fields. No existing versioned component was modified.

## Coordinated configuration and rollout

This changes printer authentication. On the exact bench device, use HTTPS /api/printer with HTTP Basic username matching the configured id and password matching its token. Remove the old secret query parameter; token now identifies the print job. Production secrets must be unique per device and at least 32 URL-safe characters. Do not put real secrets in source or URLs. Malformed/duplicate printer configuration is rejected. Physical delivery requires persistent PostgreSQL even in development.

Use firmware supporting jobToken on POST/GET/DELETE and verify text/plain rendering, character set, width and cut behavior on the exact model. Star documents [Basic authentication settings](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/client.html), [poll fields and supported firmware](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/json-request.html), [job tokens](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/json-response.html) and [confirmation retries](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/job-confirmation-delete/index.html). Confirmations return an empty response body. Disappearance of a token is not treated as physical success.

Deploy matching routes, store/schema, board and helpers together after backing up storage and coordinating device settings. Pause/drain printing first: the old implementation did not record fetch state, so legacy queued jobs may already have printed. Inspect paper and reconcile those tickets before enabling this implementation. Do not run old/new printer handlers together or roll back to the unbound acknowledgement handler with unresolved jobs. Older boards must refresh. Changing a configured printer's role/identity while jobs remain requires review.

## Evidence and limits

Fifteen new client tests cover protocol parsing/authentication/body bounds, job binding, duplicate acknowledgements, busy/offline/TTL handling, device isolation, cancellation, owner review/replay, stale revisions, atomic audit rollback, schema upgrade, close/reopen recovery, lost responses and leased connection commit/rollback/release. The standalone canonical suite covers eleven core/client cases. All 70 Mike tests and 68 Copper integration tests plus nine launch tests pass, along with targeted lint and both production Webpack/TypeScript builds.

Isolated production Next/PGlite browser fixtures verified owner controls in both clients. Copper tested pending locks and a response lost after commit: checking the saved result recovered one replacement and one review, with no duplicate effect. Actual HTTP requests verified late old acknowledgement, duplicate new acknowledgement, empty replies and preserved payment fields. Mike's owner physical-check result was displayed. Copper's 320px status layout had no horizontal overflow. All fixture credentials/orders/payment flags were synthetic. No real printer, payment or email was used.

PGlite serializes a local connection. Hosted PostgreSQL/TLS, independent concurrent connections, device network interruption, paper faults, firmware compatibility, actual paper output and owner handover remain required gates. Reviews stay in the mounted page; reload/sign-out loses browser recovery controls, while durable receipts remain in storage. Printer history contains private order data and currently has no browse/export/retention UI. Removed printer configurations need deliberate reconciliation. Notification dispatch/provider acceptance and inbox delivery are separate unfinished work.

Run npm ci and npm test in glaze/assets/printer-jobs-tests for the canonical suite. Client suites run npm test --prefix tools/workroom-tests after dependency installation. Run node glaze/scripts/verify-component-copies.mjs from the studio repo to verify source pins and hashes.
