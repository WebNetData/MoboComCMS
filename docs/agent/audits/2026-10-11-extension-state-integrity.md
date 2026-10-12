# Extension state preservation and snapshots — 2026-10-11

## Actual defects and changes

Actual PostgreSQL baseline1791719609855-41648 accepted a save over malformed stored JSON;1791719610558-18844 returned an impossible state/mirror combination during a controlled atomic competing commit. This extends the existing [atomic-write slice](2026-10-11-extension-state.md), not another registry.

Existing state owner reads each node's stored state, legacy fallback and mirror in one SQL findMany. Public runtime reads all declared states/mirrors and site.config.v1 together. Mutation-only strict parsing rejects malformed JSON, null/array state, non-boolean enabled, invalid settings shape and empty stored value; invalid legacy JSON also refuses first-state creation. Strict mode follows transaction/dependency readers and errors expose no stored contents. The original value stays intact. Missing rows still use existing defaults; ordinary read fallback behavior stays compatible. No migration, URL, permission, settings format or protected React/CSS changes.

## Executed evidence

Root .mobocom/restrictions-<id>.log retains actual owned PostgreSQL/Redis/non-root Node22/no .env evidence. Fixtures restore original Settings in finally; no real providers.

- Baseline failures above were actual assertion failures, not inferred graph relationships.
- Final four PG owners extension-state-integrity/extension-state/telegram-authority/global-restriction-admin native0:1791720379270-25484. Registered integrity default now covers both controlled competing commit and corrupted JSON/shapes/legacy fallback. The snapshot test asserts the competing commit actually reached DB, not just that no race occurred. Explicit race-only pass1791720095069-12436; one-connection recursive extension owner native0:1791719700664-45800.
- Two meaningful source faults detected/restored: disabling strict mutation reads1791720090583-34988 accepts destructive write; replacing single node query with split queries1791720091137-40956 yields mixed snapshot. Actual PG owners rerun afterward. Public-runtime atomicity is supported by its one-statement source and existing runtime unit/compiled consumers; no separate controlled legacy-first-public-runtime race claimed.
- Full check638 (581+53+4), native0:1791719760054-41092. Production build native0:1791719770339-22724, existing CSS warnings retained. Final TypeScript native0:1791720193914-19316. Only tests/docs changed after build.
- Compiled HTTPS24 pass, zero fail/skip/retry,28.6s:1791720095821-16344. Real sections API concurrently retains both fields, then malformed owned state receives400 and original bytes remain. Existing current-account/Global Admin/Telegram/checkout/security and protected Admin light/dark/mobile/a11y cases pass. Expected SESSION_REVOKED test logs and retried serialization conflict are not production outages; both concurrent section requests succeeded. No React components changed or new React Doctor scan claimed.

## Limits and next work

Mutations fail closed on the tested invalid stored inputs. Historical ordinary read fallback remains; this is not certification of a complete corruption-recovery UI, every invalid scalar mirror/legacy shape, or all module failure policies. Per-node state/mirror/legacy and public runtime use one statement; dependency traversal outside mutation and multi-node Admin lists still require a whole-operation consistency contract. Serializable mutations already read one transaction snapshot. Independent legacy flag writers, opposing dependency switches, strict lifecycle audit/publication/compensation and queued-effect reconciliation remain open. No token savings claimed. Root source/client/:3000/owner files and production data preserved, no Actions/push/PR/merge/deploy. Goal active; broad lifecycle/release remains PARTIAL.
