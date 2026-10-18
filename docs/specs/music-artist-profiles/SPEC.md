# Music artist profiles

## Audited owner and outcome

MusicArtist already has editable name/nameEn/image/cover/bio/featured, stable slug, createdById and updatedAt. Existing Media admin `music-artists` owns parsing, save, revision history, permissions and Imports reuse; the public artist page/directory and canonical track/album FKs exist. Replace the nested artist form with one modern `/admin/music/artists` manager using that same API/owner. Preserve old `library?tab=artists&edit=<id>` links through a redirect. No second artist registry, downloader, API or identity; no schema migration is needed.

## Contracts and boundaries

Existing `/api/admin/media-library?type=music-artists`: paged list/search, additive profile filters/counts/editability, id detail with bounded related albums/tracks, POST/PATCH. Keep original request/response fields and import calls. Manager `music.manage` manages all; existing `music.author` reads shared names, creates and edits only its own artists. Authors must not receive another author's draft titles. Preserve createdById, slug, English aliases and FKs unless an existing explicit legacy action changes them. New profile UI leaves slug unchanged on update; nameEn remains an optional existing music alias, not an English article system.

Artist POST/PATCH require same-site Origin, strict rate limiting and bounded JSON. The new form sends `expectedUpdatedAt`; save claims that timestamp, advances it monotonically and returns409 on stale edits, retaining user typing. Legacy callers may omit the new field for compatibility. Artist HTTP saves use strict Audit in the same existing save transaction; shared revision history remains. Imports already reuse existing artists without replacing their name/photo/bio, including intentional blank photos; do not add a redundant image lock column. Existing history and manager single/selected/all-page delete reuse the canonical bulk API and warn about its existing cascades.

[Executed evidence and continuation](../../agent/handoffs/MUSIC_ARTIST_PROFILES.md).

## UI and acceptance

Shared existing Admin/SDS/MoboCom surfaces; factor proven Cinema profile presentation into shared UI without changing its visuals. Cards/search/missing-photo/featured/unlinked filters and shared20/50/100/500/all pagination. Image and banner use existing Library/upload/explicit transfer and music artist organization context. Rich biography uses ContentEditor, length bounds and shared rendering. Preserve artist public hero/player/albums/follow behavior. Show related works with current permissions, loading/error/empty/saving/success/conflict/read-only states and explicit discard/reload.

Registered `music-artist-profiles` native PostgreSQL check: actual owner CRUD/parse/revisions, simultaneous timestamp claims, strict-audit rollback, legacy compatibility, URLs/FKs and published projection, manager/own-author/other-author/foreign-module/module-off/Origin/limit denial and filter/pagination. Deliberately remove claim/ownership protection in an isolated source snapshot and detect failure before restoring/pass. Relevant no-.env/non-root unit/types/architecture/source/security checks; actual manager/author browser workflows and legacy link, Library/biography/save/reload/stale409/public page;1440 light/dark/390, scoped axe, keyboard, React Doctor. Owner merges/deploys; no hosted Actions or provider scraping.
