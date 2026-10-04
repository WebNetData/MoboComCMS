# Preserve the current cart when replaying checkout

## Audit

The canonical Checkout owner already returns the previous order for its owner-scoped idempotency key. The Store cart HTTP adapter nevertheless removed the current snapshot's line IDs after that replay. A real PostgreSQL/HTTP fixture reproduced deletion of three units of the old product and two units of a fresh product while returning a one-unit historical order. The focused regression test failed before the fix.

## Change

Only a newly placed order consumes cart lines and marks the cart recovered. Existing-order replays preserve all current rows, quantities, timestamps and the reminder cycle. Empty-cart lost-response replay remains supported. Checkout idempotency, owner conflicts, cart URLs/payloads, prices and existing order/inventory services remain unchanged; no migration, rollout setting or UI is needed.

## Verification

Three focused tests passed for replay, initial successful checkout and failed/empty replay. Actual port-3000 PostgreSQL/HTTP checks passed for repeated historical replay with fresh current cart items, exact rows and cycle preservation, another owner's idempotency conflict, guest denial, one unchanged historical order and empty-cart replay. Test fixtures were removed. The dev runtime initially retained the old adapter; a verified restart and readiness200 preceded the successful API rerun.

This fixes historical-order replay cleanup. Concurrent edits during a newly placed order's snapshot/cleanup and guest sign-in merge still require separate work. Real new-order external settlement/provider execution was not performed.

Linux site505, TypeScript, source1574, architecture boundaries, security invariants and scoped staged whitespace checks passed. Clean committed-source build and PR CI are subsequent release gates.
