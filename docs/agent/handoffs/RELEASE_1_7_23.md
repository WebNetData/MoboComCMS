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

## Stable publication completed

PR493 and correction PR494 are merged. Exact signed/build source:
`2e2304772eb71423f032be83cbefcc7bd35aad9d`; tag `v1.7.23` resolves to it and is an ancestor of main.
[Stable/latest release](https://github.com/WebNetData/MoboComCMS/releases/tag/v1.7.23) published at `2026-11-26T11:46:25Z`.
No hosted workflow was dispatched; the destination update is still the owner's step.

After PR494 merged, the Linux Node 22 / UID 1000 / no .env canonical check passed
again in 73s (1166 site /53 connected /4 backup /14 billing plus all
architecture/source/schema/security/contract/type gates). The complete default
native PostgreSQL inventory passed 245 checks; the corrected avatar check is part
of that run. Five additional isolated checks passed: member-avatar-surfaces,
account-control, pay-public-account, section-hosts and account-erasure-files.
Both owned databases deployed all 222 migrations from empty under the dedicated
NOSUPERUSER role. Earlier populated-migration and provider recovery/financial
behavior evidence remains linked in HOSTING_CLOUD; this release does not claim
a new real domain purchase or VM/account creation.

The exact merged-source production build passed in 295s: 116 static pages,
971 trace manifests/162084 entries with mutable runtime storage excluded. Source
comparison matched 4655 committed build inputs, including every CSS file; only
Next's declared next-env.d.ts/tsconfig.json rewrites differ. Production Chromium
then passed 12 actual operations/customer/public-Pay views across dark/light and
390/1440 widths, with zero axe findings, overflow or page errors; mobile navigation
was exercised. Scoped Semgrep passed; Gitleaks' single public RFC6238 fixture was
reviewed above, with no new credential or suppression.

The original publisher `70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93` signed the package. All
5211 packaged files match filtered committed source, safe extraction and
14 bundled canonical knowledge documents pass, and the installer's embedded
package/key are identical. Installer bash syntax passes; installation was not run.
All 10 assets were uploaded first as a private draft, re-downloaded and
verified by byte count/SHA256 and both current/1.7.22 package verifiers, then
promoted stable/latest and re-downloaded/verified again. No published asset was
overwritten. The earlier unpublished 0484 candidate remains separately preserved.
The release page and both primary asset links also returned HTTP 200 without authentication.

Asset SHA256 receipts (also published as SHA256SUMS):

- AI-ARCHITECTURE-FA.md: `1a180d0922b11af9271dbe71627bc14fac15cf05fa320d59ee31143a109aed47` (5519 bytes)
- ARCHITECTURE.md: `a3dd3a716cac5e9ac39c110a76c234b15ae143bd174949e5a9ff08cf564dbfee` (96722 bytes)
- INSTALL-FA.md: `3b185bfa836ceb366669bba247a52a6cc68cc136e52c35fe421bf2139f039485` (26602 bytes)
- RELEASES-FA.md: `73856bb49f1a39639cd2f92d32a0f5dc5978e175556f2bff94b6146adb49e880` (15829 bytes)
- UPGRADE-FA.md: `0e9ff280ee39c7a5afa5a6ecf98ad2891c4c8b37eaf8817f6e67e37330de78de` (18069 bytes)
- mobocom-1.7.23.mbrelease: `dbbba32eaf2c0fd73a8ce2f06ec7db665c660ec26fadb69289f39d6917cda607` (15203844 bytes)
- mobocom-setup-1.7.23.run: `d67ec352ecb522168e405c5d14c5580f487870166c79933821dde13a9bfae4b0` (20552862 bytes)
- mobocom-setup-1.7.23.run.sha256: `b7b6cf956ebf7e9f303b5ec61e09868387cd4c3bbcf710385182bfbb3c299875` (91 bytes)
- release-public.pem: `9fd37e58318a883cd9b8af676d501e54437a94b4a4ccc3fbee6d80e299781521` (113 bytes)
- SHA256SUMS: `41cc9efec7c7745e2cf50fa7d54bd6296bec90fe71fbdb1063764585ccbe3797` (776 bytes)

Cleanup: only the verified owned production preview/tunnel were stopped; both
task databases, the task NOSUPERUSER role, private runtime, synthetic sessions/TLS
and temporary source archives were removed. Shared app3000 returned HTTP 200.
Publisher keys, other databases/volumes/worktrees and unmerged Pay work are
preserved. These completion records are documentation only; the immutable tag,
build inputs and signed assets remain at the source above.
