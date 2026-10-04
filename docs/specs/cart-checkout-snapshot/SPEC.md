# Checkout cart snapshot preservation

## Audit and owner

Store currently reads quantities for Checkout then deletes the same line IDs after a new order. A concurrent quantity edit can therefore be deleted although the order used the earlier quantity. Checkout continues to own order/payment idempotency; Store owns cart snapshot and cleanup. The browser also resets the header count to zero on every success, including historical replay, and clears its retry key on server errors.

## Behavior / compatibility

Read an internal line revision (id, quantity, updatedAt) from the same database rows used to construct the checkout view. After a newly placed order, delete only rows matching that snapshot under the existing owner-bound cart lock. Preserve every modified/replaced/new row in full; do not guess whether an edit meant a fresh purchase or a correction. The already-placed order is unchanged. Public Cart/checkout JSON, URLs, permissions and visual design remain compatible; revision metadata stays internal. Legacy internal ID-only cleanup remains supported; the HTTP checkout path always supplies its snapshot.

The browser retains its idempotency key for transport/server failures or malformed success replies. A validated success clears the key; definitive client rejection clears it except ambiguous-gateway handling. Successful checkout refreshes the badge from the canonical current cart rather than broadcasting zero. No migration or configurable policy is needed.

## Acceptance

Reproduce the old new-order cleanup deleting an edited line on real PG. Check exact snapshots, unchanged-row deletion, quantity edits, same-quantity later edits, new/replaced lines, owner binding and legacy internal cleanup; ensure no revision field reaches public Cart DTO. Run focused browser-client key/badge tests, real browser retry/badge flow and actual replay API regressions. Scoped contracts and TypeScript/source/architecture/security plus build/CI before merge. No external settlement/deployment is claimed.

Preserving an edited row in full may keep units also present in the completed order; it is a deliberate no-data-loss fallback, not automatic adjustment of a changed cart. Existing order details show purchased quantities. Sign-in merge size limits remain separate work.
