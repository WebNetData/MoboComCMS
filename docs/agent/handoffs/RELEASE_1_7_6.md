# Release 1.7.6 — corrected updater release

Owner merged PR358 at main `04060079` and requests a healthy update after the1.7.5
outage. Branch `release/v1.7.6` starts from that merge. The installed version is
already1.7.5; same-version packages are rejected, so code/behavior changes require
1.7.6. Preserve the existing1.7.5 release/tag/assets and the original publisher key.

Scope: root version metadata, an empty migration seal and operator/release notes.
No new dependency, schema, public UI or API behavior beyond merged PR358. Continue
the [host recovery evidence](HOST_INSTALL_UPGRADE.md). Source checkout still
precedes the isolated Git build; first adoption runs the installed old updater.
Adequate RAM/swap and a valid installed build remain prerequisites.

The owner explicitly requested that already-passed tests not be repeated. This
release changes metadata/documentation only from merged main `04060079`;
`src`, `scripts`, `deploy`, `next.config.js` and both Prisma schemas retain the
validated PR358 code. Reuse its actual Linux Node22/UID1000/no-.env check
(890+53+4+13),60 updater/installer tests, native PostgreSQL package admission,
production build822 and real artifact adoption/restoration readiness/static200.
These are earlier executed feature gates, not newly rerun1.7.6 tests. No visible
component changed; no new UI/browser claim or redundant full test/build run.

Release-specific gates: verify only the two root lockfile version fields differ,
all171 previously sealed migration checksums stay unchanged, the new seal is empty
and runtime source matches merged main. Build/sign from the committed readiness
tree with the same publisher; verify package version/commit/signature, installer
checksum, bounded extraction, absent runtime data/secrets and extracted source.
Post-commit package results/hashes are retained outside Git with the artifacts.

Stable publication requires owner merge of the concrete readiness PR, per
[publisher guide](../../RELEASES-FA.md). Prepare and verify the signed package before
asking for that final merge. Use the existing offline key with fingerprint
`70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93`; never generate a
replacement. Output is outside Git at `~/MoboCom-Releases/1.7.6`. Owner applies the
update; no production deployment or hosted workflow dispatch.
