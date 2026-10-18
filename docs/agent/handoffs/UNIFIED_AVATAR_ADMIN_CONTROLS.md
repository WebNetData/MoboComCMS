# Shared avatar and Admin controls — 2026-10-18

## Continue this implementation

Authoritative checkout: `.mobocom/autonomous-foundation`, branch `feat/unified-avatar-admin-controls-2026-10-18`, stacked on Cinema discovery commit `e1f8b499`. Root product checkout is older. [Scoped spec](../../specs/unified-avatar-admin-controls/SPEC.md). Do not create another identity, upload catalog, settings resolver or navigation registry.

## Ownership and changes

- Identity `UserProfile` / `updateUserProfile` already transactionally mirror public fields into ForumProfile. Existing uploaded files and both public media URL families remain in place. Missing canonical profiles import legacy forum data lazily without overwriting existing canonical profiles.
- Forum author cards, shell identity and edit projection now read canonical pictures. Explicitly clearing the canonical picture cannot resurrect a stale Forum avatar. Existing Telegram/initial fallback policy remains.
- Dashboard public-profile, Forum profile and account saves call the installed NextAuth `update()` with no identity payload. Its existing broadcast refreshes other sessions; `SessionIdentityRefresh` refreshes public server components when session name/image changes. Account/Admin client shells update from the session without refreshing their server tree or unmounting editors. Account initialization cancels stale requests. Actual unsaved-draft retention was verified. Own-profile editing remains reachable with Community disabled.
- Forum group/title eligibility is checked before the shared identity write. Denied requests leave the avatar unchanged. Forum file inputs reset for retrying the same file.
- Admin layout exposes its already authorized, enabled-module navigation through `ControlNavigationProvider`. Website management searches that projection by label, group, area and URL, supports Persian letter variants, independent filters, count, empty/loading/failure/retry states and themed responsive groups. Fresh role and module reads must both succeed before controls appear. Sidebar search does not alter directory scope.

## Existing control coverage

These are existing owners/forms, now discoverable from the directory; this batch does not reimplement their mutations.

| Area | Existing Admin owner |
| --- | --- |
| Pages, content, sections and addresses | Pages, CMS, section addresses, page/theme builders and each module's own content tools |
| Homepage, brand, header/footer and navigation | Studio, Branding, Theme builder, Mega menu; hierarchical navigation handoff remains canonical |
| Categories, subcategories, collections and publication | Existing Taxonomy and per-section content owners, with their existing CRUD/status/visibility |
| Store, Magazine, Cinema, Music, Games, Software, Forum, Community | Enabled module manifest groups and their existing settings/admin APIs |
| Files, import, image policy and copies | Shared Media library, Imports, Downloads, watermark/image settings |
| Users, fields, roles and section managers | Canonical Identity/AuthZ, registration fields, staff guards |
| Operations, channels, finance, moderation, extensions and maintenance | Existing guarded Admin tools, typed owner settings and lifecycle controls |

## Executed evidence

- Native `unified-avatar` and existing `forum-member-profile` passed on owned PostgreSQL as UID1000 without .env. Actual uploads/readback, unsaved isolation, both writers and mirrors, canonical precedence over deliberately stale Forum data, clearing/fallback, legacy URLs, server-authoritative JWT/session projection, rejected anonymous/invalid/title/group edits, and Core identity with Community disabled.
- Isolated snapshot faults: stale Forum-first precedence, removed mirror and unauthorized title acceptance each caused the native avatar check to fail; restored implementation passed. Only namespaced test rows/files were removed.
- Final non-root/no-.env validation:138 units across content-controls/community/forum-community/account-security/navigation passed; full `tsc --noEmit --incremental false`, architecture, source (1987 TS/TSX), security and audit gates passed. Commands used the writable Linux snapshot and existing dependency installation; no full release suite/build was claimed.
- Real localhost3000: both editors uploaded/saved actual PNGs; unsaved upload did not publish, forbidden Forum title did not change identity, removal reached open tabs, foreign userId did not select another profile, anonymous profile/upload requests were401. Cross-tab Dashboard/header/Forum server-shell pictures updated without logging in again. Final-runtime follow-up additionally uploaded the same Forum file twice, verified cleared file inputs, preserved an unsaved account-name draft and Dashboard success feedback, and refused a foreign Origin with403.
- Directory: full admin showed142 enabled navigation entries in this local configuration (entries, not unique capabilities). Search/filter/reset/keyboard and independent sidebar search passed. A503 navigation read exposed no controls and retry recovered. A journal-only staff token without trusted permission claims received the fresh restricted projection; users/settings controls were absent and actual Site GET/PUT both returned403. All actual disabled-path prefixes were absent. No owner module settings were changed for this test.
- Eight loaded light/dark1440/390 scoped axe views passed: four account-avatar views from the complete member-flow run, plus four directory views on the final runtime. Screenshots were visually inspected for desktop/light and mobile/dark directory composition; no overflow. Final browser run reported zero page errors. Earlier cold-start, selector and wrong-method helper failures are not counted as passed checks; the actual PUT guard was rerun.
- React Doctor0.9.17: nine affected React files, telemetry/supply-chain off, blocking error; exit0,0 errors/21 warnings. Existing shell/form complexity, search-param, fetch/lifecycle and button diagnostics remain. The changed async Admin fetch is cancellation-guarded; the string substring-search warning is a false array-lookup diagnosis, not a reason to replace substring semantics with Set membership. No rule was suppressed. Scoped Semgrep: one configured rule,12 files,0 findings/errors; existing configuration anchoring warning retained.
- Both PG checks were rerun successfully after the final writer/read changes; local health returned200 with database ready. All owned browser users, role, audit rows and uploaded files were removed. Owner settings, users, images and unrelated untracked files were preserved. Redacted Gitleaks on the staged patch reported no leaks; private browser auth state was removed.

Reproduce native/unit evidence with the normal repository runners:

```text
node --test scripts/content-controls.test.cjs scripts/community.test.cjs scripts/forum-community.test.cjs scripts/account-security.test.cjs scripts/navigation.test.cjs
node scripts/run-pg-checks.cjs unified-avatar forum-member-profile
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/check-architecture.mjs
node scripts/check-source.mjs
node scripts/check-security.mjs
node scripts/check-audit.mjs
```

The PG runner needs DATABASE_URL to an owned migrated database; each check owns/cleans its fixture rows. Actual local invocation used `docker exec --user 1000:1000 mobocom-app node /src/.mobocom/avatar-validate.cjs` and `--pg`; private auth/browser helpers stayed ignored. The isolated fault helper was `/src/.mobocom/avatar-faults.cjs`. Do not copy fixture tokens into source.

## Limits and remaining work

- No schema migration, bulk rewrite, new avatar toggle, API URL change or owner API permission expansion. Existing staff may open the directory; only their permitted controls appear. Directory visibility is not authorization; owner APIs remain authoritative.
- Immediate refresh covers the saving member's sessions and open shells. Other people's already-open feeds/comments are not a new global realtime subscription; they see canonical data on their existing refresh/navigation.
- The directory inventories registered tools. It is not proof that every static string, theme composition or module field is Admin-configurable. New requests for currently code-defined behavior require a scoped owner/form audit and typed settings; do not introduce an unrestricted table editor or mark the whole Control Plane complete.
- Existing page/theme builders remain the owners of visual composition and add/edit/delete controls; arbitrary deletion of canonical identity/security/history is not a presentation setting.
- No hosted Actions, production deployment, provider delivery or fresh production-build claim for this slice. Owner merges.

Raw local evidence is ignored under root `.mobocom/avatar-evidence`, `avatar-doctor*.json`, `avatar-semgrep.json`; Linux validation logs are `/tmp/avatar-*.log`. Browser auth fixture state is private and removed after cleanup.
