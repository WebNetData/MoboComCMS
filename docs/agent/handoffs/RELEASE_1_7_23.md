# Release 1.7.23 — 2026-11-26

Owner explicitly authorizes PR, merge and stable1.7.23 publication; destination
update remains with the owner. Authoritative release checkout
`.mobocom/release-1.7.23`, branch `release/1.7.23`, from Cloud `e1cc8be6` /
connection repair `deaac03e` and merged main `c9355792` (PR492).
Unrelated worktrees and unmerged Pay readiness `7e6b1ae9` are preserved separately.
No hosted workflow dispatch or live service/provider mutation is part of this release.

Scope: four unreleased additive migrations (account login/erasure and Cloud
operations), current private Cloud/Pay/account surfaces, real WHM authentication,
closed WHM/Joker/Proxmox/Hetzner adapters, encrypted claimed provider operations,
Admin/customer controls and central invoice/order financial fences. The canonical
feature evidence is in HOSTING_CLOUD and CLOUD_WORKSPACE; it includes full local
1166/53/4/14 checks, twelve nonroot PostgreSQL suites, populated migration,
negative replay control, sixteen browser views/fourteen axe scopes, Doctor and
scoped scanners. Re-reading those receipts is not a new execution.

Release preparation changes matching package/root-lock versions and operator
guides, seals the four migrations as1.7.23 and preserves every already-released
SQL hash and the original Ed25519 publisher. Default provider automation stays off.
Pause financial/Cloud writers and workers during matching source/schema rollout,
take verified backup, health-check before resuming; do not rollback an old writer
blindly under new constraints. No automatic deletion or production deployment.

Validation, exact accepted source, artifact hashes, PR/merge/publication and
cleanup receipts are recorded below as they actually complete.
