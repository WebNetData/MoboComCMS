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
- Deploy step for the owner: `npm run deploy:migrate`. Migrations added since 2026-10-06: `20261129120000` and `20261130120000` (cinema calendar and episode alerts), `20261201120000` (digital codes), `20261202120000` (forum moderators), `20261203120000` (data only: roles holding `cms.posts` keep what it used to open), `20261204120000` (clubs), `20261205120000` (data only: the first four music languages), `20261206120000` (a delivered code can be taken back), `20261207120000` (film release day), `20261208120000` (forum reputation, set from the reactions already stored), `20261209120000` (language of subtitle and audio files), `20261210120000` (collections written by staff), `20261211120000` (playback preferences), `20261212120000` (moderation cases), `20261213120000` (people of films and series; filled by a worker step after deploy), `20261214120000` (versions of edited items), `20261215120000` (saved admin views). All additive or data-preserving.
- Server settings still needed: `STORE_DELIVERY_KEY` for digital codes; SMTP or SMS for password recovery.
- After deploy: arrange forum categories into sections, and narrow any role that held `cms.posts` if it should be the magazine alone (`/admin/section-managers`).
- SQLite installs have no migration runner here: a data migration must be repeated by hand there.
- Before calling `main` verified: `tsc`, `arch:check`, `source:check`, `schema:check`, `security:check`, `test:site` on Linux, `test:pg`, and the GitHub "Browser tests" run. Check that merged branches really reached `main` (`git merge-base --is-ancestor`).
- Migrations and releases: a migration is added to `unreleased` in `prisma/release-manifest.json` by the pull request that adds it; `node scripts/release-migrations.cjs list` shows what the next release will run; at release, `node scripts/release-migrations.cjs seal <version>` closes them, after which they are never edited. `npm run release:migrations` (in `npm run check`) fails on any disagreement.
- Pull request gate: `.github/workflows/checks.yml` runs `npm run check`, a first deploy on an empty PostgreSQL (`deploy:migrate`, `deploy:seed`) with `test:pg` and `test:redis`, and the production build. A release is not cut from a commit whose checks are red.
- Migrations added 2026-10-07: `20261214120000` (content revisions), `20261215120000` (admin saved views), `20261216120000` (money state rules: validates stored rows and stops with the constraint's name if one breaks a rule), `20261217120000` and `20261218120000` (document columns on pages and articles). All additive.
- New since then: the plugin `block-editor` (GPL-2.0-or-later `@wordpress/*` packages, private use), the setting `site.maintenance.v1`, `npm run test:redis`. The production build needs a 4 GB heap on Node 22 (`NODE_OPTIONS=--max-old-space-size=4096`); the browser suite's development server needs more (`e2e.yml`).
