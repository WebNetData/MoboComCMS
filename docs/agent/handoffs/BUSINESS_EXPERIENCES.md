# Business experiences — continue existing work

## Owner requirements

Trustpilot-like experiences of buying from or dealing with **external businesses, internal sellers and MoboCom's own store**. Modern Persian/RTL/mobile UI, SDS/MoboCom semantic tokens, light/dark, actual browser/Doctor/a11y. Canonical reviews/Identity/services and historical seller reviews must be preserved. Record progress so another agent continues rather than rebuilding. The owner deploys the server.

## Where to continue

- Branch: `feat/business-experiences-2026-10-12`.
- Authoritative local implementation: `.mobocom/autonomous-foundation` under the project root. Root worktree contains unrelated owner changes; never reset it or replace protected package/environment files.
- Base: merged PR149 `229cec503a20874687efbe98d343690dbc1fa98f`. First domain commit `e3093c8`; the core implementation and this handoff continue on the same feature branch. Inspect Git for the latest committed head and any additional working diff before taking action.
- Specification: [business-experiences](../../specs/business-experiences/SPEC.md).
- Root continuation state: `.ai/MOBOCOM_WORKSTATE.md` and ignored `.mobocom/business-experiences-checkpoint.json`. This tracked handoff is for agents without those local artifacts.

## Implemented / in-progress ownership

| Owner | Current work |
| --- | --- |
| `businesses` | Domain URL/experience/profile normalization; exact current `businesses.manage` and User guards in serializable commands; profile create/edit with immutable identity, reviewed representative assignment; directory/profile queries and HTTP; optional module and Admin Control Plane settings |
| `content` | Additive `business` item type/card/public path; SITE purchase evidence from existing paid/delivered Order |
| `reviews` | Existing ItemReview/Score/Helpful/Stat for EXTERNAL/SITE; approved-only business aggregate preserving legacy content pending-star behavior; business experience/moderation/reply parts behind same public address |
| `marketplace` | SELLER uses original SellerReview/order eligibility/reply owner; optional transaction/status arguments preserve old callers; old records are not copied into ItemReview and Marketplace is not globally enabled |
| UI | `/businesses`, `/businesses/[slug]`, `/admin/businesses`; scoped semantic-token CSS; business forms, stars, helpful votes, responses and Admin profile/moderation manager. Latest UI is not yet browser-certified |

No parallel account, review store, media store, permission resolver or scoring system. External client purchase badges are ignored. SITE uses actual stored purchase; SELLER requires an owned paid/delivered order containing that SellerId. Representatives may reply only, not change customer reviews. The new module defaults OFF and requires `reviews`; enable through existing Extension Manager after validating.

## Database / existing data

Additive migration `20261223120000_business_experiences` is registered in `prisma/release-manifest.json` and **already applied to the owned isolated PostgreSQL fixture** (105 migrations total). Never edit its applied SQL. Both Prisma schemas include BusinessProfile, canonical representative UserId, optional Seller binding and additive ItemReview experience/reply metadata. Internal profile identity invariants and unique SITE/domain/seller indexes are enforced in PostgreSQL. Existing data/URLs/money states were not reset. PostgreSQL schema generation passed; SQLite has schema parity only, not a claimed executed migration runner.

## Executed evidence so far

- Domain/engagement14: `.mobocom/restrictions-1791808277410-38684.log`.
- Architecture before latest implementation: `.mobocom/restrictions-1791808303978-6412.log`.
- Earlier TypeScript: `.mobocom/restrictions-1791808304887-34164.log`.
- Registries37 generated: `.mobocom/restrictions-1791813426265-23340.log`.
- Initial schema parity/money: `.mobocom/restrictions-1791813477817-13428.log`.
- Owned migration105: `.mobocom/restrictions-1791813571594-25084.log`; client: `1791813572553-43160.log`.
- TypeScript after initial UI/ManageBar correction: `.mobocom/restrictions-1791814252872-38516.log`. Initial wrong ManageBar props failed `1791813976195-35476.log` and were fixed against its actual public props.
- Graphify candidates confirmed in actual sources; root graph is not current-business-runtime proof and traversal was budget-truncated. No claimed token savings.

Connected business **storage** scenarios passed on PostgreSQL: `.mobocom/restrictions-1791815792646-20264.log`, via registered `scripts/business-experiences.connected.cjs`. This tests actual ItemReview/SellerReview, moderation, identical repeats, score-only changes, reply isolation, vote retention, rollback, uniqueness, SITE evidence and external badge isolation. It substitutes module visibility/unrelated services and does **not** prove current actor/HTTP authority. Latest TypeScript passed `.mobocom/restrictions-1791815805602-22976.log`.

Engagement suite initially failed because business dimensions had only three entries; added explicit quality dimension, preserving old keys. Full `check` initially failed two exact lists for newly registered sections (`1791815878411-43832.log`); tests now explicitly include businesses and verify its own permission/maintenance isolation. Runtime overlay copied generated files as root; `EACCES` fixed with targeted ownership restoration and helper adjustment. No test success is claimed from either failed command.

Current command authority passed with real PostgreSQL via registered `scripts/business-authority.connected.cjs`: `.mobocom/restrictions-1791816099672-45064.log` (storage check also re-passed). Actual current Identity/module/2FA/GLOBAL guards and strict audit rollback are exercised; the JWT boundary alone supplies the owned fixture actor. HTTP/browser business flows remain separate acceptance.

Full `npm run check` passed `.mobocom/restrictions-1791815980024-45960.log`: architecture/source/schema/release/money/security/audit/i18n,585 site tests,53 isolated connected tests, TypeScript and4 backup tests. These53 are not claimed as PostgreSQL checks; the two registered business PG scripts ran separately.

Scoped React Doctor completed with no blocking errors; `.mobocom/business-react-doctor.json` records three maintainability warnings (review form complexity, Admin complexity and coincidental table JSX). Profile page still needs inclusion in final review.

Actual production build passed `1791816116304-46056.log`. Compiled Playwright business flow passed with zero retries: `1791816413193-6056.log`, covering search→profile→logged-in pending review→Admin approval→representative reply→Admin edit link; guest write401;1440 light/dark and390 dark with no horizontal overflow or scoped axe violations. Screenshots copied to `.mobocom/business-browser-evidence` and dark desktop/mobile visually inspected. Origin captured/restored `1791816412984-33396.log` / `1791816427792-29324.log`; module snapshots restored by the test. Browser uses disposable seeded fixture, not root3000.

Three intentional source faults (score moderation, generic moderation bypass, current permission bypass) each failed with assertions; originals restored, then both PG scripts passed `1791816407606-40628.log`. Exact fault evidence `.mobocom/business-probes.json` and `.mobocom/business-probe-*.log`.

Visual review found missing canonical public header/footer; added `src/app/businesses/layout.tsx` using existing SiteHeader/SiteFooter/theme owner. Final build passed `1791816522970-15116.log`; final compiled browser flow/theme/viewport/axe passed `1791816735558-3224.log` with zero retries. Origin restored `1791816750160-24592.log`; screenshots `.mobocom/business-browser-final-evidence`. Additional profile/layout Doctor `.mobocom/business-profile-react-doctor.json` has no errors and one complexity warning. Do not call the whole feature done: suggestions/report/private-proof slices and broader acceptance remain pending. Do not run Actions per edit; use local gates, then a consolidated PR.

## Required next actions

1. Continue from the verified backend: identical repeat retains approval/reply/helpful history; rating/body/date/dimension edit re-enters moderation; generic moderation refuses business. Review discoverability in the old generic moderation queue so its operators are directed to the business owner rather than offered a forbidden action.
2. Add remaining native concurrency and old/populated migration preservation cases without editing applied SQL. Current authority, storage/evidence/history, strict audit and deliberate fault checks already exist and passed: extend them, do not restart.
3. Extend actual browser coverage for helpful votes, all filters/pagination, disabled module and unauthorized representative/manager paths. Search/profile/review/approval/response/Admin edit/theme/mobile/axe already passed. Address scoped Doctor complexity warnings through focused components when extending forms. Preserve protected existing pages.
4. Relevant architecture/source/schema/security/test/build gates; inspect diffs and update this handoff, ledger, map, root workstate and checkpoint with actual results/commit IDs.
5. Member suggestions, abuse/report integration and reviewed private external purchase proof remain later spec slices; do not render dead controls or label self-reported external reviews verified. If required for completion, implement through canonical owners rather than parallel stores.

## Local safety / tools

Owned fixture `mobocom-restrictions-1791658568103`, database `restrictions_1791658568103`, PostgreSQL/Redis `mobocom-runtime-1791644441693-*`. Root app3000 is a different worktree/runtime; do not overwrite it without completing controlled rollout. Local helper `.mobocom/prepare-restrictions-runtime.cjs --foundation` overlays changed sources; `.mobocom/run-restrictions-command.cjs` retains native exit/logs. No source/tests editing during checks/build/browser, no DB-mutating native test during browser. Beads absent: existing workstate is authoritative. Exact source/Serena before graph inference; no document/cloud indexing.
