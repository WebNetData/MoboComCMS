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

## Post-merge validation and test-loader correction

PR493 merged as `0484a5a3e07712e6d8afdc25107f3848f3b7d409` before
the requested production build. Its Linux UID1000/no.env canonical check passed
(1166 site /53 connected /4 backup /14 billing), production build passed in329s
(116 static pages;971 trace manifests/162054 entries), and12 production Chromium
views of Cloud operations/customer and public Pay in two themes/two widths passed
axe, overflow and browser-error checks. No destination deployment occurred.

The full default native PostgreSQL inventory passed244 checks and exposed one
test-loader failure: member-avatar-surfaces called TypeScript transpileModule
without fileName, so a newly reachable plain .ts generic arrow function in Forms
was parsed as TSX. Supply the resolved fileName to preserve each source file's
actual grammar; production code and every behavioral assertion stay unchanged.
The corrected connected test and account-control, pay-public-account and
section-hosts then passed on the isolated NOSUPERUSER database. A fresh complete
inventory and exact-source build follow this correction's merge before signing
the final candidate. The previous unpublished candidate is superseded, not shipped.

Scoped Semgrep returned zero findings/errors. Redacted Gitleaks reported one
reviewed public RFC6238 SHA-1 test vector in account-security.test.cjs, derived
from the Appendix B ASCII test input; it is not a deployed credential. No new
scanner suppression, publisher key change or hosted workflow dispatch was added.
