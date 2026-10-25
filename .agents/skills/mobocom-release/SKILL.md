---
name: mobocom-release
description: Prepare, validate, migrate, deploy, update, or recover MoboCom safely. Use for production releases, schema migrations/backfills, module/plugin/theme upgrades, API compatibility gates, backup/preflight, feature rollout, rollback and launch readiness.
---

# Release workflow

Tooling: `docs/agent/DEVSTACK.md`. Run local redacted Gitleaks and one relevant SAST engine; new findings fail, existing baselines are reviewed evidence rather than exemptions to refresh automatically. Use existing CI, consolidate PRs and avoid workflow dispatch/repeated pushes under the owner's Actions quota. Do not run the full tool stack after every edit.

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

## Platform mandate routing — 2026-10-10

Read current repository root instructions, then task-relevant sections of `docs/agent/ARCHITECTURE.md` and `PLATFORM_DECISIONS.md`. The canonical contracts, domain matrix and roadmap are linked there; read only the affected scope. If the repository is unavailable, use the fallback from `references/architecture.md` and do not infer current implementation from it.

Release new group/restriction/lifecycle/theme policies through expand/backfill/compare/switch with schema parity and release manifest. Preserve historical sanctions, money and unknown documents. Verify optional-modules-off, lifecycle recovery, cache/session invalidation and theme fallback when affected. ProductionVerified requires named deployed operational evidence; broad matrix U cells and local tests are not production certification.

<!-- mobocom-business-skill:start -->
## Business experiences routing

When this workflow touches business/Trustpilot-style experiences, first read docs/agent/handoffs/BUSINESS_EXPERIENCES.md and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve its authoritative checkout; continue existing ItemReview versus SellerReview owners and recorded evidence. Missing files in another checkout do not justify a new system. Load only the pending slice; the handoff is the continuation source.
<!-- mobocom-business-skill:end -->

<!-- mobocom-forms-skill:start -->
## Forms, held work and safety routing

When this workflow touches forms, form payments, appointments, staff queues, ticket ownership, SMS sending, sign-in limits or automation rules, first read docs/agent/handoffs/FORMS_AND_OPERATIONS.md. Extend src/modules/forms; charge through the site checkout; keep the rule that work somebody holds is changed only by its holder or a manager of that section. The handoff lists what is still untested — run those before calling anything ready.
<!-- mobocom-forms-skill:end -->

<!-- mobocom-engineering-skills:start -->
## Supporting engineering skills

For supporting UI/design, React, accessibility, browser testing, documentation or MCP authoring, first read `docs/agent/ENGINEERING_SKILLS.md` in the active MoboCom checkout and load only its relevant task skill. Existing module owners, SDS/MoboCom tokens, protected visuals and actual local validation remain authoritative; generic upstream stack/aesthetic preferences are not architecture decisions.
<!-- mobocom-engineering-skills:end -->

<!-- mobocom-whole-site-quality-skill:start -->
## Whole-site quality routing

Read task-relevant sections of `docs/agent/WHOLE_SITE_QUALITY_STANDARD.md` under the current architecture/owner decisions. Use sections10/12 for scoped executed evidence and rollback; do not dispatch hosted workflows automatically or reinterpret a documentation change as deployment authorization.
The shared execution brief is for an explicit whole-site task; this routing does not start one.
<!-- mobocom-whole-site-quality-skill:end -->
