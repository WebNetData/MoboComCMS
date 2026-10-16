# Shared public media library and optional localization

## Current evidence / ownership

Continue the authoritative worktree on `feat/media-library-transfers-2026-10-16`, stacked on journal `1d5b7c91` and business `8856859e`. Existing owners: Site `cover-store`/`/api/admin/media` for images, Downloads chunk uploads/local `/files`/remote copies, editor MediaLibrary, CMS CoverField/FileUpload, Imports `ImportMedia` source/content dedupe and image rewriting, Operations BackgroundJob/scheduler. No second blob store, queue, identity, editor document or importer.

## Outcome / actors

One public asset catalog under Media: nested logical folders, search/type/tag filters, grid/list, durable display name/alt/caption/tags, reuse, upload, trash/restore and opt-in URL transfer. Managers/authors retain the exact existing content/author permissions or settings.manage; library access grants no right to publish another section. Canonical Identity/GLOBAL/password reset/2FA facts are checked on commands and again before deferred work. Private proofs, form/support uploads, credentials, backups and temporary files are excluded.

## Invariants and flows

- Catalog existing covers and public uploaded download files without moving/renaming bytes. Logical folder moves/display renames preserve every existing URL. Trash only hides a catalog entry and is reversible; used files remain served. Folder deletion requires an empty folder. Prevent cycles and concurrent stale metadata edits.
- Use one shared selector in classic/block editors, covers, galleries, music/cinema/game/software/store file/link fields. Preserve canonical block documents and classic image sizing/alignment/caption behavior. Do not turn private customer uploads into shared public assets.
- External links remain external unless the operator explicitly selects copying. Immediate copy returns the local asset after success. Deferred copy captures operator authority and requested time in Media transfer metadata and runs through the existing BackgroundJob queue/scheduler. Its stable local transfer URL redirects to the original public source while waiting/failed, then to the stored asset after success; the UI explicitly explains this transition. No background blind rewrite of edited posts is required.
- Image copies reuse existing safe image importer/content dedupe. Files stream to existing Downloads storage with connection-time DNS/redirect validation, credentials/private-network refusal, bounded size/time, cancellation and partial-file cleanup. Never buffer a video into memory or execute an uploaded file. Preserve range/download serving.
- Durable transfer metadata is not another queue. Current actor/configuration, generation/lease claims, checkpoint/fencing, retry/cancel and recovery prevent stale/duplicate adoption. Invalid or revoked authority fails closed. Shared Settings controls enabled intake, size/time limits; secret-guarding request limits are strict.
- Bulk import has an explicit copy-assets checkbox and immediate/deferred choice. Unchecked retains external addresses and performs no media fetch, including embedded HTML and downloadable media links. Older jobs lacking the new setting keep their historical image-copy behavior; new wizard jobs explicitly choose. Preview never fetches. Templates/history/rollback keep existing contracts; a failed optional copy retains its original URL and warns.

## Data / compatibility

Implementation authority: existing content permissions allow reuse/upload and own metadata edits; `media.manage`/full/settings access manages shared assets. Global intake remains settings.manage. Deferred import work retains its distinct imports.manage purpose. New jobs receive a server-owned mediaPolicyVersion1/opt-out marker retained through preview/plan/run. Recovery fences interrupted immediate requests through the existing queue. Current evidence and limits: [handoff](../../agent/handoffs/MEDIA_LIBRARY.md).

Additive MediaFolder/MediaAsset/MediaTransfer metadata with canonical User/BackgroundJob references in both schemas and the release manifest. No existing content, URLs, permissions or ImportMedia history is reset. Register existing files incrementally; public assets only. Reuse existing Admin and plugin navigation/control-plane mechanisms.

## Acceptance

Registered native PostgreSQL `media-library`: folder cycles/concurrent moves, search/tags/metadata CAS/trash/restore, old URLs/data, current-authority denial/audit rollback, transfer generation/retry/revocation and dedupe. Native network tests exercise real local HTTP via a non-production-only loopback fixture: redirects/rebinding rejection, missing/false lengths, bounded streams, timeout/partial cleanup, real image/file/video copy and local range serving. Deliberate faults must fail the relevant rules.

Actual browser: library/folders/subfolders/upload/name/tags/selectors; image/classic/block and file/video insertion; immediate/scheduled transfer across a real queue tick; bulk import checked versus unchecked/preview; section-only account and direct forbidden write. Verify Persian RTL, light/dark1440 and390, focus/axe/overflow and reviewed React Doctor. Local TypeScript/architecture/source/schema/security plus affected units/PG/build as justified; report only executed checks. Owner merges/deploys, no repeated hosted Actions.
