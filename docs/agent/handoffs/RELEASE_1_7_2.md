# Release 1.7.2 — publisher continuation

Owner 2026-11-04: build 1.7.2 so the site can be updated without trouble. Functional source is merged main `1f3f3aea`
(through PR342: hosting add-ons and domains). `release/v1.7.2` changes version metadata (`package.json`,
`package-lock.json`), seals the two unreleased hosting migrations into 1.7.2 and moves the operator guides to 1.7.2; it
adds no functional code or dependency. Published as a Pre-release, then marked **stable and latest** by the owner the same day (same tag, commit and assets; notes heading edited only). Git installs see it in `/admin/updates` only as a stable release (`pickUpdate` hides pre-releases from a stable install). Same publisher key; existing tags and assets
stay immutable. Owner merges the metadata PR.

## Executed validation (on the release commit, clean LF tree, Linux Node 22)

- `npm run check` with 1.7.2 metadata: **859 pass / one existing skip** (Site), then 53 mock-connected, 4 backup,
  13 billing. `release:migrations` accepts the sealed 1.7.2 block; sealed hashes equal the committed LF bytes.
- Sixteen native PostgreSQL suites on a fresh, unseeded database with all 169 migrations: `hosting-catalog`,
  `hosting-services`, `hosting-renewal`, `hosting-hourly`, `hosting-addons`, `hosting-domains`, `permalink-routing`,
  `miniapp-feed`, `user-groups`, `section-maintenance`, `module-availability`, `digital-content-pricing`,
  `money-state-rules`, `order-closure`, `invoice-void-settle`, `current-account-consumers` — all passed.
- Real upgrade rehearsal: the immutable `v1.7.1` migrations (167) on a separate database; inserted a user, an IRT
  wallet account and ledger row, a setting, a hosting product with price, a delivered service and its action. Applying
  1.7.2 ran exactly `20270216120000_hosting_addons` and `20270217120000_hosting_domains` (169 in all). All seven
  snapshots (1.7.1 columns) were identical before and after; the existing service read `extraTrafficGb = 0`; the domain
  tables were empty (no data created by migration). Scratch databases dropped.
- Production build as UID 1000 (`node` user), ephemeral production-valid configuration, supported Webpack path:
  compiled, 102 static pages, **816 NFT manifests / 85,942 entries**, runtime storage excluded (`check-runtime-traces`).
  `build:postgres` regenerates the Prisma client inside the shared root-owned `node_modules`, so the client was
  generated from the same schema as root and the remaining steps (`extensions:generate`, `next build --webpack`, trace
  check) ran as UID 1000. Local build, not the owner's VPS.
- Release extraction tests (`scripts/release-files.test.py`): 3 pass.
- Gitleaks 8.30.1, redacted, over the 58 files changed since `v1.7.1`: one finding, the RFC 6238 TOTP test vector in
  `scripts/server-panel.test.cjs` (synthetic, already present in 1.7.1). No new secret.
- Publisher key: the existing offline Ed25519 key (outside Git, `~/.mobocom-release-signing`) still has public
  fingerprint `70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93`, the 1.7.1 publisher.

Package build, signature/extraction verification, upload and re-download comparison are recorded in the ignored local
publisher folder `~/MoboCom-Releases/1.7.2` and the delivery message, never private key material.

## Server use and limits

Installed sites: `mobocom-1.7.2.mbrelease` at `/admin/updates` (fresh-password unlock, publisher check, mandatory
backup), or `sudo mobocom update 1.7.2` on a git-based install. Do not upload GitHub's Source code ZIP or copy `.next`.
The destination builds dependencies locally. Hosting stays default-off; no sample data ships. Registrar, panel and
virtualizer drivers remain owner-access work ([Hosting continuation](HOSTING_CLOUD.md)). Code rollback does not rewind
schema; the two new migrations are additive and unused by 1.7.1 code. Keep an off-server backup. Guides:
[release notes](../../releases/1.7.2.md), [downloads](../../RELEASES-FA.md), [upgrade](../../UPGRADE-FA.md).
