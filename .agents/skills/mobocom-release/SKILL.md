---
name: mobocom-release
description: Prepare, validate, migrate, deploy, update, or recover MoboCom safely. Use for production releases, schema migrations/backfills, module/plugin/theme upgrades, API compatibility gates, backup/preflight, feature rollout, rollback and launch readiness.
---

# Release workflow

1. Read release/security/contracts references.
2. Determine real app/schema/module/plugin/theme/extension API state.
3. Prefer expand → backfill → switch → later contract migrations.
4. Verify backup/preflight and module/plugin/theme compatibility.
5. Run relevant contract gates: Spectral/oasdiff/Pact provider verification when applicable.
6. Run architecture/security gates: dependency checks, Opengrep, Trivy, zizmor as relevant.
7. Run actual unit/integration/API/E2E/visual/build checks according to changed scope.
8. Use `trs` to compress verbose command output without hiding exit status.
9. Preserve Identity and production data; module disable is never data deletion.
10. Keep rollback realistic: app rollback/feature disable/module disable first; data restore is explicit last resort.
11. Never claim a check passed unless it actually did.

## This repository
- Deploy step for the owner: `npm run deploy:migrate`. Migrations added since 2026-10-06: `20261129120000` and `20261130120000` (cinema calendar and episode alerts), `20261201120000` (digital codes), `20261202120000` (forum moderators), `20261203120000` (data only: roles holding `cms.posts` keep what it used to open), `20261204120000` (clubs), `20261205120000` (data only: the first four music languages), `20261206120000` (a delivered code can be taken back), `20261207120000` (film release day), `20261208120000` (forum reputation, set from the reactions already stored), `20261209120000` (language of subtitle and audio files), `20261210120000` (collections written by staff). All additive or data-preserving.
- Server settings still needed: `STORE_DELIVERY_KEY` for digital codes; SMTP or SMS for password recovery.
- After deploy: arrange forum categories into sections, and narrow any role that held `cms.posts` if it should be the magazine alone (`/admin/section-managers`).
- SQLite installs have no migration runner here: a data migration must be repeated by hand there.
- Before calling `main` verified: `tsc`, `arch:check`, `source:check`, `schema:check`, `security:check`, `test:site` on Linux, `test:pg`, and the GitHub "Browser tests" run. Check that merged branches really reached `main` (`git merge-base --is-ancestor`).
