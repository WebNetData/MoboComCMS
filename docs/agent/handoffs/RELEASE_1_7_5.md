# Release 1.7.5 — publisher readiness

Owner requests stable1.7.5 to update their installed site. Branch `release/v1.7.5` starts at merged main `fef3531c` (PR355 music/social and PR356 content PDF). Scope is release metadata, operator notes, the existing manifest seal and verification. Preserve prior tags/assets and all owner work. No dependency/schema rewrite or hosted workflow dispatch.

Existing feature evidence: [PDF](CONTENT_PDF.md), [music/social](MUSIC_FILES_SOCIAL_IMAGES.md). Release validation is running on the final metadata tree; the executed results below are distinct from earlier feature checks. One additive migration since1.7.4: `20270219120000_music_transfer_metadata`, retained historical transfers get `{}`. Verify empty PostgreSQL, full native suites, data-preserving1.7.4 upgrade, production build/browser and signed package/extraction against the same committed source.

Stable publication waits for owner merge of the concrete readiness PR, per [publisher guide](../../RELEASES-FA.md). Use the existing offline publisher key, fingerprint `70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93`; never generate a replacement key. Output remains outside Git under `~/MoboCom-Releases/1.7.5`. No production server deployment; the owner applies the signed update. Rollback changes code/feature flags, not stored history or schema.

## Executed release gates

- Final metadata tree: complete Linux Node22/UID1000/no-.env check passed (883 Site,53 source-connected,4 backup,13 billing) including architecture, source, types, schema parity, sealed migrations, money, security/audit/i18n.
- Fresh isolated PostgreSQL applied all171 migrations; all178 registered native suites passed. Other optional isolated suites are not claimed.
- Real immutable1.7.4→1.7.5 rehearsal: one additive migration, all170 prior names/checksums retained, identical user/IRT wallet/ledger/classic external URL/block document/unknown setting/historical transfer rows. Old transfer metadata defaults to{}.
- All3265 source/test/schema hashes matched the normalized Linux validation copy; the lockfile changes only the two root version fields. No package dependency changed.
- Three Python release-extraction tests passed. Scoped local Semgrep55 runtime files and redacted Gitleaks found zero issues; this is scoped coverage, not whole-platform security certification.
- Production Webpack build on Node22/UID1000 with4GiB heap passed: compiled in2.2min,102 static pages,822 runtime trace manifests/94,607 entries excluding runtime storage.
- Actual Edge against this production bundle through local HTTPS passed1440/390 light/dark layouts, scoped WCAG2A/AA/2.1AA axe0/no overflow, eight design choices, settings save/reload, native preview, real Persian-filename download, per-kind disable/direct404 and Origin/anonymous-Admin403. No page errors; screenshots were visually reviewed. All3265 source/test/schema hashes still match the built source.
- Build/sign/verify the package only after committing this readiness tree. Post-commit signature, pinned publisher, extraction/source comparison and asset checksums are recorded outside Git in `~/MoboCom-Releases/1.7.5/publication.json` and the final release notes. Do not publish stable until owner merge is verified. The official extraction test script passed all3 tests; no product checker or assertion was weakened.
