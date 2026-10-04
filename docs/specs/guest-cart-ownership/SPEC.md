# Guest cart ownership and atomic sign-in merge

## Existing owner and gap

Store's existing Cart/CartLine, browser token and canonical UserId remain the only cart identity. `findCart` currently reads a guest then unconditionally assigns its userId; competing sign-ins can both claim it. Existing merge copies lines and deletes the source outside a transaction, risking partial loss. Line writes lock the parent but do not recheck its owner after a guest claim.

## Behavior

One conditional source-parent write inside a transaction serializes guest claims/merges. Recheck the canonical owned cart after locking the source. Claim only a still-guest matching token; losing contenders resolve only their own cart, never the winning owner's. When an owned cart exists, lock it, copy missing product/variant lines and delete the guest atomically. Preserve the previous duplicate policy: existing owned line quantity wins, source-only lines keep their quantities. A concurrent unique owned-cart creation retries the ownership resolution once; infrastructure errors propagate. No new cart identity or table is needed.

Every cart mutation rechecks its original userId or guest token/null-user binding in the parent lock. A stale guest mutation fails without changing rows or reminder state. A freshly created guest cart uses the token returned by ensureCart for this check. Source merge failure rolls back every copied line and leaves the guest accessible. All source/target checks use database state in the transaction.

## Compatibility / acceptance

Existing URLs, cookie shape, permission model, prices, data and protected design are preserved. No configurable policy or migration is required. Test deterministic real PostgreSQL simultaneous same-token claim, same-owner claim, source/target merge duplicate behavior, copy failure rollback and mutation racing ownership transfer; regression-test canonical ordinary/bundle additions. Actual auth/guest HTTP should deny old-token reads/writes after claim and preserve current owned cart. Scoped tests, TypeScript, architecture/security and build/CI precede merge.

This does not change the legacy union-size policy on sign-in merge. Merge caps/user recovery UX and new-checkout snapshot cleanup remain separate work; do not silently drop guest lines to impose a limit.

## Executed evidence

Real PostgreSQL reproduced two different accounts both claiming the same guest cart before the change. After the change, deterministic conflicting-user and eight same-user claimers, six simultaneous merges, preserved duplicate quantities, forced failure after one copied line with complete rollback, and stale guest add/set/clear/purchased-line operations all passed. An already-claimed token starts a separate fresh guest cart. Actual auth/guest HTTP confirmed claimed-token read privacy, guest update/clear exclusion, fresh guest cart/token and unchanged owned rows. Namespaced fixtures were removed.

Canonical cart concurrency/caps/ownership and fixed bundle PG regression checks passed. Four scoped route tests, Linux site506, TypeScript/source1574, architecture and security passed. Clean committed-source build and PR CI remain subsequent gates; no production deploy or external settlement is claimed.
