# Agent State / Repository Map Convention

To reduce repeated repository scans, keep concise machine-maintained files under `docs/agent/` when useful.

## MOBOCOM_MAP.md
Record:
- source revision / commit when updated
- module locations
- core registries
- schema locations
- key test/release commands
- protected UI component locations
- important architectural boundaries

Keep it short. Update only when structure changes.

## CAPABILITY_LEDGER.md
For active/previous feature batches, record concise rows:

| Capability | Owner module | Status | Key files | Tests | Notes |
|---|---|---|---|---|---|

Statuses:
`GOOD`, `WEAK_UX`, `WEAK_BACKEND`, `WEAK_SECURITY`, `PARTIAL`, `DISCONNECTED`, `DUPLICATE`, `MISSING`, `REGRESSED`.

Do not use this ledger as truth when code has changed. Validate relevant rows against current repository before acting.

## DECISIONS.md (optional)
Only durable architectural decisions, not daily logs.
Record:
- decision
- reason
- alternatives rejected
- compatibility consequence

Do not create a giant diary.
