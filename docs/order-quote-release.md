# Checkout quote review — order-quote 1.0.0

This client-owned primitive validates whole quantities and cents, computes totals with exact integer tax rounding, and compares the server's fresh quote with the amounts the guest reviewed. The client supplies its menu and the reviewed option-pricing resolver. It does not connect to a payment provider.

## Integration

- Adopted in Mike's Place and Copper's parked ordering demo. Copper's public order links and host restrictions still point customers to Toast. Mike's menu prices and kitchen hours remain marked as samples until confirmed.
- The order POST reads the current menu without the ten-second page cache. Mike's reads workroom-backed display prices/visibility; Copper's demo reads its separate ordering document. Kitchen pause and sold-out status remain separate inputs.
- Guest lines include itemId, quantity, group-qualified options, quotedUnitCents and quotedAgeRestricted; expectedTotals contains all five displayed amounts. These amounts are a review checkpoint, never the pricing authority. A changed price, fee, tax total or age requirement returns 409 with a validated replacement quote before any ticket, order, print job or email is created.
- The guest sees the new total and must click again. Hidden/sold-out items are refused; the cart and contact details remain available. Pending fields are locked. Incomplete or failed acknowledgements retain the cart and ask the guest to check with the kitchen before retrying.
- The helpers reject fractional/coerced quantities and tips, duplicate identical cart lines, ambiguous option catalogs and unsafe totals. Tax uses integer basis points and half-up rounding. The existing client configuration (including fee tax treatment) is retained; this release does not validate a business's tax obligations or install a tax service.
- Demo state is explicit even if a Stripe environment key exists: no online payment adapter is implemented. Production memory-backed ordering is unavailable. This does not certify the remaining PostgreSQL connection configuration.
- Deploy the editor/client, routes, menu loader, configuration and helper together. Older pages missing the review fields receive a review response or need a refresh. There is no automatic client upgrade service.

## Verification

Run the studio's shared-components tests and copy verifier. In each client run node --test --test-isolation=none tools/workroom-tests/*.test.cjs and its production Webpack/TypeScript build.

Four canonical tests exercise collision-safe cart identity, arithmetic, malformed/ambiguous inputs and per-line review/response checks. Actual client route tests cover warmed page cache versus fresh submission, changed/hidden/sold-out items, paused/closed ordering, production memory refusal, malformed input, forged amounts and zero effects before review. Mike's also checks exact decimal conversion of its display prices.

September 17 local production Next previews with a PGlite adapter verified both browsers preserve details and update totals after a price change, create no order until review, then create one unpaid demo order after an explicit click. Mike's additionally verified pending-field locks and preserved details after a delayed 503. Fixture mail/printers were disabled. This is local adapter evidence, not hosted database, provider, inbox or owner-device verification.

## Remaining operating requirements

Order acceptance currently uses random IDs without a durable retry key; order creation and printer fanout are separate writes. An ambiguous response can still lead to duplicate orders if a guest retries. Durable idempotency and transactional notification/print jobs are the next acceptance work.

The kitchen PIN/session, persistent throttle, state-update concurrency, status transition rules, cancellation/refund semantics, PostgreSQL TLS/initialization and real owner fulfillment handover still require work. The price snapshot is fresh when read but is not locked against an owner edit between that read and order insertion. No card is charged or refunded by this release, and neither complete ordering application is declared production-ready.
