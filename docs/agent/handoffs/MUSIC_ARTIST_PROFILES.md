# Music artist profiles — 2026-10-18

## Continue this implementation

Authoritative checkout: `.mobocom/autonomous-foundation`, branch `feat/music-artists-admin-2026-10-17`, stacked on local Cinema profiles commit `afcf757f` after Games PR195 was merged. Do not recreate it in the older root checkout. Owner merges and deploys. [Specification](../../specs/music-artist-profiles/SPEC.md).

Music already owned artists, their public pages, imports and profile fields. This slice improves that same capability; there is no new artist registry, API, downloader, identity, setting or migration.

## Owners and compatibility

- Canonical `MusicArtist`, track/album foreign keys and `media/server/admin.ts` remain authoritative. Existing `/api/admin/media-library?type=music-artists` still accepts its original list/detail/create/update and legacy partial-save contracts. Additive fields: counts, `profileCanEdit`, profile filters, bounded related works and optional `expectedUpdatedAt`.
- `/admin/music/artists` provides name/alias, portrait, banner, rich biography, featured flag, search, missing-photo/featured/unlinked filters and shared20/50/100/500/all pagination. Existing Library/upload/explicit RemoteCopy use the music artist organization context. History and manager select-all/delete reuse existing owners. Deletion retains existing cascading semantics and requires confirmation; the UI warns that dependent tracks/albums are deleted.
- Legacy `/admin/music/library?tab=artists&edit=<id>` redirects to the same artist editor. Track/album/playlist editors remain in the old library; deep links remount the appropriate editor. Music menu/tab and missing-image dashboard links use the dedicated page.
- Preserve `music.manage` for all artists and existing `music.author` for shared reading plus own create/edit. Authors cannot delete artists. Do not copy Cinema's manager-only shared-person policy here. Detail returns at most30 tracks and30 albums; authors receive only their own works, managers all. Other authors' draft titles are withheld.
- Profile edits keep `createdById`, slug, IDs and track/album relationships. The new form does not change a slug; legacy explicit slug editing remains supported by the existing API. Existing Latin-name alias is retained, not a second translated article system.
- POST/PATCH require same-site Origin, strict rate limiting and bounded JSON. The new form claims `updatedAt` and advances it monotonically; stale saves return409 while preserving local typing. Strict audit commits inside the existing save transaction. Shared revision recording remains the existing postcommit, best-effort behavior. Legacy callers without the new token remain compatible and are not concurrency-fenced by this form's token.
- The Music importer already reuses existing artists without rewriting name/photo/biography, including an intentionally cleared image. It matches current name/nameEn: changing both names can affect later name-based matching. This slice does not invent immutable import identity or another image-lock column.
- Public `/music/artist/<slug>` retains hero, playback, albums, follow, counts and URLs. Sanitized formatted biography and legacy plaintext line breaks render through the existing editorial renderer; SEO uses plain text. Standalone artists remain public under the existing Music policy, unlike uncredited Cinema people.
- Cinema and Music reuse presentation-only `components/admin/ProfilePortrait.tsx` and `ProfileManager.module.css`; failed previews fall back to an initial. Shared public-image validation excludes private application paths, traversal and credential-bearing URLs without fetching. Cinema's domain errors and native regression checks remain intact.

## Executed evidence

Private helpers/reports/screenshots: active/root ignored `.mobocom/music-artist-*`. Do not commit cookies, fixture state or disposable source snapshots.

- Linux UID1000, no-.env snapshot:105 relevant content-controls/Music discovery/dashboard/Media admin tests passed; full TypeScript, architecture,1976-file source/import, security and audit gates passed.
- Fresh owned PostgreSQL database `mobocom_music_profiles_20261017`: all121 migrations applied; registered `music-artist-profiles`, `cinema-people-admin` and `cinema-people` passed. Artist coverage exercises actual shared save/parser/DB/revisions/audit, manager/own-author/other-author access, related-draft privacy, simultaneous claim200/409, strict-audit rollback, stable slug/aliases/FKs/blank picture, legacy partial save, filters/all five sizes and module/Origin/limit refusals. Existing manager bulk deletion and author single/bulk deletion refusals passed on owned fixtures.
- Deliberately removing the timestamp claim and bypassing author ownership in the isolated snapshot each failed native assertions. Restored source passed; product runtime was not fault-mutated.
- Actual localhost3000 Playwright passed manager/own-author/read-only-other workflows; old artist redirect and album deep link; Library Enter/Escape/focus restoration/selection; visual biography editing; create/save/reload; picture/banner; retained text on stale409 and explicit discard/reload; history link; search/filter/all five sizes; select-all, cancelled deletion and confirmed existing bulk deletion of a disposable unlinked artist.
- Eight scoped Admin/public1440/390 light/dark views passed axe with zero violations and settled no-overflow checks. Screenshots inspected. Public checks verified curated photo/banner/formatted bio, stable address and exclusion of other-author drafts; the existing Haamim page was opened. This is scoped evidence, not whole-site accessibility certification.
- React Doctor0.9.17 affected-file review exits0; new artist components have no diagnostics. Retained library and public artist functions have existing complexity warnings; no suppression/baseline changes.
- Scoped Semgrep used the existing local dynamic-code rule on17 runtime files: zero findings. Its existing path-pattern deprecation warning remains visible. Graphify refresh was unavailable here because this checkout lacks its adapter; no graph freshness or token-saving claim is made.
- Redacted Gitleaks scanned the staged feature diff with zero leaks. Browser-created content, revisions, users, roles and audit fixtures were removed; private cookie state was deleted. Owner content/settings were retained.

## Boundaries

No production build, full-platform regression, deployment or GitHub Actions is claimed. No automatic external biography/photo sourcing was added. Artist merging, manual reassignment and redesigning artist deletion are outside this profile slice. Existing storage permissions and explicit transfer opt-in still apply.
