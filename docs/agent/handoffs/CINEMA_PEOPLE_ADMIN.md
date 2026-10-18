# Cinema people profiles — continuation, 2026-10-17

## Source and scope

Continue `.mobocom/autonomous-foundation`, branch `feat/cinema-people-admin-2026-10-17`, after the owner merged Games PR195. Do not recreate the feature in the older root checkout. [Specification](../../specs/cinema-people-admin/SPEC.md). Owner merges/deploys; this slice has no deployment or hosted Actions run.

`CinemaPerson` and `CinemaCredit` remain canonical. `cinema/server/person-admin.ts` owns list/detail/create/update, `domain/person-profile.ts` validates curated data, and `server/http/people.ts` composes existing Identity/module guards, strict rate limits, bounded JSON and transactional Audit. `/api/admin/cinema/people` GET list or `?id=`, POST create, PATCH update; POST/PATCH require same-site Origin. Only `cinema.manage`; Cinema authors and Magazine staff cannot edit shared people. No public/mobile API contract is introduced.

## Use and compatibility

- `/admin/cinema/people`: new Cinema menu/tab; name search, actor/director/uncredited filter, shared20/50/100/500/all pagination, create/edit, linked-title inspection and published-profile links.
- Display name, formatted biography and image reuse shared ContentEditor, sanitizer, public Media Library/upload and explicit RemoteCopy. Saving a URL does not download it. Images with a failed preview fall back to an initial. Existing theme tokens, RTL and responsive Admin shell remain.
- Display edits fill `displayNameKey`, without rewriting immutable `normalizedName`, stored title cast/director text, existing IDs, URLs, roles or credits. Both original and curated names remain searchable. Roles derive from credits; one person can be both actor and director. A manually created person is private until linked to a published title.
- `imageLocked` preserves a manually selected or intentionally cleared portrait on sync/enrichment. Unlock restores existing automatic filling/promotion. `profileVersion` is an optimistic concurrency token;409 retains the form, and explicit reload/discard opens the current version. Version claim and strict audit commit atomically; automatic promotion uses the same lock/version boundary and increments the token.
- Public profile renders sanitized biography with plain SEO description and nonce-bearing Person JSON-LD. The title page reads canonical portraits without rewriting source cast. Original page composition and person addresses are retained.

Migration `20270107120000_cinema_people_profiles` adds three defaulted columns to the existing model in both Prisma schemas and is listed in the release manifest. Apply additive migrations before deploying the new Prisma client/code. Older writers do not know manual locks: stop/restart old workers during rollout before relying on that protection. No destructive backfill or data reset. Local pre-migration PG dump is private under root `.mobocom/cinema-people-before-20261017.dump`; no new restore rehearsal is claimed.

## Executed checks

Ignored local helpers/reports are under the active/root `.mobocom/cinema-profile-*`; cookies, dumps, temporary users and source snapshots must not be committed.

- Linux UID1000, no-.env source snapshot:76 content-controls tests and19 editor tests passed; full TypeScript,1970-file source/import, architecture, security, audit, SQLite/PostgreSQL schema parity and release-manifest checks passed.
- `node scripts/run-pg-checks.cjs cinema-people-admin cinema-people` passed on a newly created PostgreSQL database after all121 migrations. Tests create/clean their own rows. Also passed against the existing disposable authoring DB. Profile check covers real create/deduplication, sanitization, simultaneous stale-write conflict, audit rollback, preserved IDs/credits/source names, dual-name search, all five page sizes, locked photo/blank behavior, unlocked promotion/version increment and draft-only privacy.
- Two deliberate faults in the disposable snapshot (remove stale-write claim, bypass manual-picture lock) each failed the native assertions; restored source passed. Product runtime was not mutated by the fault runner.
- HTTP unit coverage exercises module-off404, denied permission403, absent/foreign Origin403, strict-limit429 and invalid operation422.
- Actual localhost3000 Playwright passed: Cinema-manager edit, shared Library selection, biography/save/reload, stale409 with retained local typing and explicit reload/discard, search/role/page size, manual creation and uncredited404, existing public profile/name/biography/portrait/title links, actual Person script nonce, and anonymous/Cinema-author/Magazine-only/foreign-Origin denials. Eight1440/390 light/dark Admin/public views passed scoped axe with zero violations and settled responsive no-overflow checks; screenshots were inspected. Identity tests use isolated contexts to prevent an old open page's session refresh from overwriting a newly selected test cookie.
- Actual keyboard check passed logical Tab/Shift+Tab order, Enter to open the existing Library dialog, Escape to close and focus restoration to the trigger. Redacted Gitleaks on the feature commit found no leaks.
- Browser findings fixed in the canonical shared editor: five empty Persian TinyMCE color/attribution translations now have accessible names; supported `iframe_attrs.title` names the frame. The people-page tab contrast and visible-link names are scoped fixes. This keeps the existing editor engine and attribution.
- React Doctor affected-file review exits0; new profile components have no diagnostics. Shared ClassicEditor has one pre-existing reviewed warning: JSON error body is deliberately parsed before the following `response.ok` refusal. The preserved title-page composition retains prior complexity/index-key warnings; no rules/baselines were suppressed. Scoped one-rule Semgrep scanned32 runtime files with0 findings; its existing path-pattern deprecation warning was not hidden.

No production build, hosted browser workflow, full-platform regression run, provider scrape or deployment is claimed for this Admin slice. Keyless metadata/provider evidence remains in the authoring handoff. All browser-created profiles/title/users/roles/audit fixtures were removed afterward; owner content/settings were not edited.

## Remaining boundaries

Public discovery/profile presentation now continues in [Cinema discovery](CINEMA_DISCOVERY.md): actor/director filters, distinct-work directory counts, uncapped per-role totals and full-filmography links use the same canonical people/credits. Admin curation, matching, image locks and permissions above remain authoritative.

Person deletion/merging, manual credit reassignment and person follow/notifications are outside this slice. External metadata/photos can still be incomplete or restricted; the profile editor supplies manual curation, not a source-completeness guarantee. This does not certify a production deployment or the whole platform.
