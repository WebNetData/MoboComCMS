# Release 1.7.3 — publisher continuation

Owner 2026-11-05: build 1.7.3, stable, so the site can be updated. Functional source is merged main `e9413382`
(through PR349: updater fixes PR345, final-address links PR346, human check PR347, Xray profiles PR348, MoboCom Cloud
PR349). `release/v1.7.3` changes version metadata (`package.json`, `package-lock.json`), seals
`20270218120000_human_check` into 1.7.3 and moves the operator guides to 1.7.3 (publisher examples to 1.7.4); it adds no
functional code or dependency. Published **stable and latest** at the owner's request. Same publisher key; existing tags
and assets stay immutable. Owner merges the metadata PR.

## Executed validation (on the release commit, clean LF tree, Linux Node 22)

- `npm run check` with 1.7.3 metadata: **872 pass / one existing skip** (Site), then 53 mock-connected, 4 backup,
  13 billing. `release:migrations` accepts the sealed 1.7.3 block.
- Every native PostgreSQL suite of `scripts/run-pg-checks.cjs` on a fresh, unseeded database with all 170 migrations: **165 passed**. One real regression found and fixed on this branch: `current-account-consumers` posted a public form without the new human check (form check is on by default); the suite now stubs `humanCheckRefusal` like `mobile-account-entry`, and `human-check` still covers the real form route. The other seven failures are not from 1.7.3; each fails the same way on the `v1.7.2` tree: `import-profiles` and `editor-groups-experts` refuse to run without their own disposable database name; `search-advanced-scale`, `search-scan-cap`, `search-facets`, `guest-cart-ownership` and `cinema-discovery` fail assertions on 1.7.2 too. They are owed a separate look; the eleven optional isolated checks were not run.
- Real upgrade rehearsal: the immutable `v1.7.2` migrations (169) on a separate database; inserted a user, an IRT wallet
  account and ledger row, a setting, a hosting product with price, a delivered service and its action. Applying 1.7.3
  ran exactly `20270218120000_human_check` (170 in all). All seven snapshots were identical before and after;
  `HumanCheckUse` was empty. Scratch databases dropped.
- Production build as UID 1000 (`node` user), ephemeral production-valid configuration, 4 GB heap, supported Webpack path: compiled, 102 static pages, **818 NFT manifests / 164,616 entries**, runtime storage excluded (`check-runtime-traces`). Prisma client generated from the same schema as root first. Local build, not the owner's VPS.
- Release extraction tests (`scripts/release-files.test.py`): 3 pass.
- Gitleaks 8.30.1, redacted, over the 14 commits since `v1.7.2` (120 files changed): no findings.
- Publisher key: the existing offline Ed25519 key (outside Git, `~/.mobocom-release-signing`), public fingerprint
  `70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93`.

Package build, signature/extraction verification, upload and re-download comparison are recorded in the ignored local
publisher folder `~/MoboCom-Releases/1.7.3` and the delivery message, never private key material. A Git bundle with tags
`v1.7.3 v1.7.2 v1.7.1 v1.7.0` is attached for servers whose GitHub fetch is throttled.

## Server use and limits

A site on 1.7.2 updates with 1.7.2's scripts: restore the four build-written files first and prefer
`sudo mobocom update 1.7.3` (4 GB build heap), or the bundle route; then re-run `deploy/ubuntu/xray-install.sh` once
for Xray builder 2. Steps: [release notes](../../releases/1.7.3.md). The human check starts on for every place with the
built-in proof; the owner can switch it off or lighten it in `/admin/security`. Code rollback does not rewind schema;
the new table is additive and unused by 1.7.2 code. Keep an off-server backup.
