# Music file branding and social images — 2026-11-05

Authoritative checkout: `.mobocom/autonomous-foundation`, branch `feat/music-file-branding-social-images-2026-11-05`, based on merged main `75b63665`. [Scenario/ownership/security/rollback](../../specs/music-files-social-images/SPEC.md). Owner merges and deploys.

## Delivered behavior

Music settings at `/admin/music/settings` control new transfer names and embedded tags independently, with editable brand/site URL. Default naming uses foreign singer/song and the field's quality, e.g. `Foreign Singer - Foreign Song - 128.mp3`. Server-selected artist names, importer-resolved names and a persisted transfer snapshot remove dependence on the source filename. Exclusive numbered collisions never overwrite files. Old files/links and old queued transfers remain unchanged; fresh switches apply when new queued work executes.

The reusable Downloads MP3 writer preserves audio bytes and replaces source metadata. Other advertised audio formats use ffmpeg stream copy. MP3 needs no external tool; M4A/FLAC/OGG/OPUS/WAV need ffmpeg. Existing download-time cleanup also uses this writer; a trusted completed-transfer marker preserves the physical tags when legacy cleanup is enabled. The native test downloads those bytes with legacy cleaning on and compares the entire file. Missing foreign names fall back to existing names; unnamed/non-audio files keep source naming behavior. Foreign metadata is additive to the existing editorial forms, not a new translation system.

Telegram image posting now uploads actual JPEG bytes through the existing Bot API/Xray address, and retries a failed photo instead of silently sending text. Its default-on image switch is at `/admin/social` → Telegram. Instagram's existing public JPEG endpoint now reads local covers/downloads/ready transfers directly, with bounded public-only remote fetch as fallback. Content item-card visibility remains authoritative. Full covers are retained on a 1080×1350 canvas.

## Executed evidence

- Full local `npm run check` on LF Linux Node22, UID1000, no `.env`: 878 site, 53 connected-source, 4 backup and 13 billing tests; types, architecture, source, schema parity, migration manifest, security/audit/money/i18n gates passed.
- Native PostgreSQL: music-files, social-images, media-library, social-queue, section-settings-history, import-field-inputs passed. The two new suites exercise production owners and local HTTP/filesystem; provider requests are doubled and no external messages are sent.
- Actual ffmpeg/ffprobe: MP3, M4A, FLAC, OGG, OPUS and WAV have brand/site tags; decoded audio hashes match before/after. The independent MP3 assertion compares every original audio byte.
- Deliberate filename corruption and silent-photo-fallback regressions each failed their new native suite; originals restored and both suites passed again.
- Real upgrade rehearsal: immutable 1.7.4's 170 migrations, an existing transfer, then the new additive column. Historical migration checksums and selected transfer values/timestamps stayed identical; `musicMetadata` defaulted to `{}`. No production database was used.
- Installed Edge: eight light/dark, 1440/390 Admin views; scoped axe WCAG2A/AA/2.1AA zero, no horizontal overflow/page errors. Actual settings save/reload, foreign-name form values, real local audio transfer/ID3 bytes and dashboard-only direct-write 403 passed. Music managers legitimately retain their own settings access.
- React Doctor affected four components: zero errors, 22 reviewed warnings in existing large components; comparison against main reports zero new diagnostics, with no rule suppression. Local two-rule Semgrep: 21 runtime files, zero findings/errors. Redacted Gitleaks on task source/test/schema copies: zero findings. These are scoped checks, not comprehensive security certification.

Raw local proof is ignored under `.mobocom/music-social/`, with check/native logs, JSON, upgrade receipt and themed screenshots. A disposable container uses isolated source/Prisma/storage/database, leaving the owner's app/settings/uploads intact. The initial preview's nonstandard dependency mount caused Webpack errors; a standard `node_modules` path fixed the test environment. No product bundler/dependency changes were needed.

## Operator notes and limits

Run the normal `npm run deploy:migrate` before starting the new code: additive `20270219120000_music_transfer_metadata` is in `unreleased`. No version bump or replacement of stable 1.7.4 artifacts is part of this feature. Keep the column through rollback and use the switches to stop new transformations.

Live Telegram/Instagram delivery and real proxy credentials were not exercised; local tests validate the actual multipart/JPEG/API payload paths with provider boundaries doubled. Instagram must be able to reach the configured HTTPS image URL. No new production build, full native PostgreSQL matrix, hosted workflow or production deployment is claimed for this feature batch. Existing files are not renamed or retagged retroactively.
