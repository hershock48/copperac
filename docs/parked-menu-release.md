# Copper parked-demo menu saves

Local verification: September 17, 2026. Copper's public customers still order through Toast. This editor changes only the parked ordering demo; it does not update Toast or the separate website-menu workroom controls.

## What changed

The owner editor loads a fresh saved document and revision. PUT requires that revision and a complete validated menu. A single PostgreSQL statement compares both revision and content, updates the menu, and inserts full before/after history. The first save is an insert-if-absent. Each accepted save gets a new revision, even when the values return to an earlier state. Older tabs cannot overwrite a newer save. Audit failure rolls the menu write back. Existing ordering_menu rows receive the legacy revision during schema initialization; their menu data is preserved.

Owner access, private no-store responses, a bounded 512 KiB JSON body and production persistent-storage requirements protect both load and save. Menu shape checks reject ambiguous option/choice names, invalid visibility, invalid prices, unsupported photo URLs and excessive content. The bundled 118-item menu passes the new checks.

Prices remain text while editing. Invalid or over-precise amounts stay visible and block saving instead of silently becoming zero or rounding. Both item and option prices convert to exact whole cents only after validation. Saving freezes the submitted fields, and a response must contain the complete matching document and a new revision before it counts as saved. The editor reuses owner-save 1.0.0; its server revision helper reuses content-cas 1.0.0. Those immutable shared source files are unchanged.

Switching among the kitchen's internal tabs preserves the mounted menu draft. A rejected or uncertain save retains it. Compare latest saved menu loads a separate read-only copy; selecting that copy replaces an unsaved draft only after a second explicit button press. No automatic merge or force overwrite is offered. Download draft retains exact typed dollar strings, including invalid entries, in a local JSON file for manual recovery. The latest ten save timestamps are shown; full before/after documents stay in the private database. Saved menu changes also update the current owner's availability-board item list.

## Verification

Eight new focused tests cover exact decimal parsing, invalid-draft retention, complete response/menu validation, first-write races, audit rollback, stale and ABA revisions, legacy-data migration, database close/reopen, memory isolation, authorization, bounded input, production-memory refusal and lost acknowledgement. All 53 Copper integration tests and nine launch checks pass, along with targeted ESLint and a production Webpack/TypeScript build.

Run npm test --prefix tools/workroom-tests and node --test --test-isolation=none lib/__tests__/launch-readiness.cjs. Build with STUDIO_BUILD_CHECK=1 and next build --webpack to preserve the active development output.

Actual production Next/PGlite browser checks used two owner windows and a synthetic menu. A 9.999 draft stayed visible and was not submitted. Switching kitchen tabs retained it. One window saved 8.50 while pending fields locked; the stale window's 9.00 save was rejected without losing the draft. Comparison showed the saved 8.50 and required explicit draft replacement. A later save committed 9.25 but lost its response; the editor preserved the draft, comparison recovered 9.25, and the guest demo displayed 9.25. Exactly two menu-history rows existed. The recovery panel fit at 320px with no horizontal overflow. No external inbox, payment service or real customer data was involved.

## Rollout and limits

Deploy the editor, kitchen wrapper, menu loader/fields, API, store and menu-document-store/schema together. Back up existing data first. Older open editors lack revisions and must refresh. The configured database role needs permission to add ordering_menu.revision and create ordering_menu_history/index. Verify the migration, simultaneous connections, actual PostgreSQL/TLS, process restart, page-cache behavior and owner access on the intended host. Local PGlite serializes a single connection and does not certify that host.

Drafts do not automatically survive full reload, sign-out, session expiry or closing the tab. A browser navigation warning is best effort; download before leaving. There is no automatic draft importer, three-way merge or history-restore screen. Recovery after an uncertain save compares current saved content; it does not create a new action receipt or claim a second write succeeded. Other server instances may retain guest menu cache for up to ten seconds; fresh order submission still checks current prices. Existing print/notification recovery work remains separate. This release is published for review, not deployed or certified for live ordering.
