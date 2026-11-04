# Release 1.7.1 — publisher continuation

Owner2026-11-04 explicitly requests version **1.7.1**. Functional source is merged main `ea1e3666` (through PR339). `release/v1.7.1` changes version metadata, seals the three existing hosting migrations and updates operator/release documentation; it adds no functional code or dependencies. The release remains a Pre-release, consistent with1.7.0. Owner merges the metadata PR; publishing is authorized separately by the current release request. Existing releases/tags/assets remain immutable.

## Executed validation

- Actual Linux Node22 UID1000/no `.env`, `npm run check` with1.7.1 metadata: **924pass/one existing Linux certificate-helper skip** (854 Site,53 mock-connected,4 backup,13 billing). Architecture, source, schema/parity, migration sealing, money, security, audit, i18n and TypeScript gates ran.
- Fourteen native PostgreSQL suites on a fresh, unseeded167-migration database: `hosting-catalog`, `hosting-services`, `hosting-renewal`, `hosting-hourly`, `permalink-routing`, `miniapp-feed`, `user-groups`, `section-maintenance`, `module-availability`, `digital-content-pricing`, `money-state-rules`, `order-closure`, `invoice-void-settle`, `current-account-consumers` passed. They exercise their real owners/transactions, with the explicit external-service/configuration doubles recorded in each suite.
- Real upgrade rehearsal: immutable1.7.0 schema/migrations applied to an owned separate database; inserted an owned User, nonzero IRT wallet and historical credit, Page and routing Setting. Applying the three new migrations reached167 with all five rows byte-equivalent after serialization. No hosting data was created by migration. Published migration SQL is unchanged; no seed was run.
- Final1.7.1 production `build:postgres` as UID1000, ephemeral production-valid configuration, supported Webpack path:102 static pages, **807 NFT manifests/306800 entries**, runtime storage excluded. This is a local build, not deployment on the owner's VPS.
- Actual Python release extraction/adoption/undo/path tests:3pass. Existing package-signature/update tests ran in the full gate. Source is unchanged from the merged UI feature batches; their actual browser evidence remains in the Hosting/Mini App/Permalink handoffs. No new live Telegram, payment, panel/virtualizer, SSL or target-server result is claimed by packaging.
- The existing offline publisher key was verified against the public key downloaded from GitHub1.7.0. Public Ed25519 fingerprint: `70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93`. No key generation/rotation; private key stays outside Git, assets and containers.

## Packaging and publication contract

Use the existing `scripts/build-release-package.cjs` from committed HEAD. Git archive uses LF committed bytes on Windows. The filtered signed source package excludes runtime data, env, private key files, agent state and dependencies/build output. Check actual payload version/commit/signature and every extracted file against the committed archive; verify installer wrapper/bundle and checksum. Upload `.mbrelease`, `.run`, `.run.sha256`, the unchanged public key, three operator guides and `SHA256SUMS`. Download all assets again and compare before publishing the draft. Record final tag/commit/assets and results in ignored local publisher evidence, never private key material.

Version metadata and the migration manifest must reach main through the metadata PR so subsequent releases do not reuse a published number or reseal old migrations. A single `[skip ci]` push carries branch/tag; GitHub Actions are not used for building or uploading. The owner performs the server update; do not silently deploy or merge.

## Server use and limits

An installed package-based site uses **`mobocom-1.7.1.mbrelease`** at `/admin/updates`, with the existing fresh-password unlock, publisher check and mandatory backup. Do not upload GitHub's Source code ZIP or copy `.next`. Destination Linux builds dependencies locally. Runtime settings/credentials/media are retained; local sample plans/module activation do not ship. Existing root helpers are only refreshed by explicit trusted bootstrap; ordinary uploads do not replace root code or publisher trust.

Hosting stays default-off and its real provider-driver gaps remain in [Hosting continuation](HOSTING_CLOUD.md). Code rollback does not rewind schema or newly created data. Keep an off-server backup and use the existing operator recovery procedure. Guides: [release notes](../../releases/1.7.1.md), [downloads](../../RELEASES-FA.md), [upgrade](../../UPGRADE-FA.md), [publisher/updater ownership](WEB_PACKAGE_UPDATES.md).
