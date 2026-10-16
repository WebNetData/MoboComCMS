# Shared media library — continuation, 2026-10-17

## Authoritative source / ownership

Continue `.mobocom/autonomous-foundation`, `feat/media-library-transfers-2026-10-16`, above journal `1d5b7c91` and business `8856859e`. Do not recreate it in the older root checkout. [Specification](../../specs/media-library/SPEC.md). Owner merges/deploys; no hosted Actions/PR/deployment in this slice.

Public server address: `src/modules/media/server/library.ts`; other modules must not import its private `library/` parts. Media owns logical asset/folder/transfer metadata. Site cover-store still owns image bytes; Downloads owns public chunk uploads/range serving; Imports ImportMedia owns decoded image/source/content dedupe. Canonical User/Settings/Audit and Operations BackgroundJob remain shared. No parallel storage, identity, queue or editor document.

The enqueue primitive/job labels were extracted behind existing Operations reexports to avoid a queue/import/media cycle. Existing scheduler runs queue each minute and media recovery every five minutes; use deployment's existing authenticated cron setup. Existing `/api/admin/media`, `/api/media/covers/...`, `/files/...` and FileUpload exports stay compatible.

## Use

Open `/admin/media` (**کتابخانهٔ رسانه**). The same selector serves covers, classic/block editors, galleries and shared file/link fields across Music, Cinema, Games, Software and Store.

- Folders/subfolders, multiple upload/drop, grid/list, type/search/tags, pagination40. Select one for name/alt/caption/tags/folder; select several/a page for bulk move/tag replacement/trash/restore. Logical rename/move preserves URLs. Empty-folder deletion refuses cycles/depth overflow/stale revisions.
- **دریافت از لینک**: public direct image/file URL, destination folder, immediate/background/scheduled mode. List includes status/time/errors/retry/cancel. Cover/file/block fields expose the same explicit option.
- Classic/fallback HTML **انتقال رسانه‌های لینک‌شدهٔ متن به سرور** includes images, video/audio/source, posters and recognized file links. Pasted external URLs remain external until confirmation. Manual local image uploads remain local. Save the post after applying links; background work never blindly rewrites edited posts.
- New bulk jobs default copy-assets off server-side (`mediaPolicyVersion:1`); settings/plan/dry-run/run preserve the decision. Unchecked performs no media fetch, including embedded HTML/audio/files. Preview never copies. Historical jobs without the marker retain prior image-copy behavior. Failed optional copies retain the original URL and warn.

Deferred `/api/media/transfers/:uuid` links are local immediately but return no-store307 to the original source while waiting/FAILED/PAUSED, then the stored asset when READY. CANCELLED is404. UI discloses this; pending bytes are not yet local. Treat transfer links as public media URLs. Source query strings are not shown in Admin lists/audit/errors.

## Authority / configuration

Existing content managers/authors read/reuse/upload and edit their own metadata/folders. `media.manage` or existing full/settings access manages the shared catalog, without granting cross-section publishing. Historical full roles retain access via CORE_ADDED_LATER. Structural folder moves require full media management; global policy requires settings.manage.

Transfers capture actor/authAt and media-versus-import authority. Worker rechecks current standing/GLOBAL/password-reset/TOTP/permission before receive, at streaming checkpoints and before transactional adoption. Generation/lease fencing handles retry/cancel/stale workers; serializable revision claims/strict audit guard metadata. Files stream with connection-time DNS and per-redirect checks, byte/deadline limits and partial cleanup. Production cannot enable loopback fixtures.

Library Settings uses canonical `media.library.v1`: enabled, file cap default512 MiB/max4096, timeout default120sec/max480. Image copying retains the existing15 MiB decoded-image limit. Direct chunk uploads retain existing server limits. Discovery only includes UUID covers and allowlisted public Downloads uploads with realpath/symlink checks. Private business proofs/support/forms, configuration/backups/caches/incoming files remain excluded.

## Migrations / rollout

Both Prisma schemas add MediaFolder/MediaAsset/MediaTransfer and canonical User/BackgroundJob references. Applied locally/listed in release manifest: `20270105120000_media_library`, `20270105121000_media_transfer_authority`. Do not edit applied SQL. Deploy before new code; retain storage volume/scheduler. Empty owned PostgreSQL deployed119 migrations; main data retained. A pre-migration pg_dump exists locally, but no fresh restore rehearsal this batch. Discovery is incremental100 at a time; **یافتن فایل‌های قبلی سایت** completes the walk without moving bytes or inferring uploaders.

## Actually executed

Ignored raw reports/screenshots: root `.mobocom/media-library-evidence/`. Never commit fixture cookies/credentials, dumps or uploads.

- Linux UID1000/disposable no-.env copy:64 media/import/file/download/editor units passed, including streamed bounded JSON/playable HTML. Obsolete source-shape assertion replaced by actual legacy route denial/upload/catalog-creator behavior; missing font fixture copied before final success.
- Registered media-library connected check: real empty-migrated PostgreSQL/filesystem/HTTP, folder cycle/concurrent CAS/ownership/metadata/search/tags/trash/stable bytes; current revocation/strict-audit rollback; decoded image/catalog; redirects/private DNS/no-length cap/timeout; immediate dedupe/cancel/local redirects; actual BackgroundJob queue/import-only file/revoked import permission; interrupted immediate-request recovery; unchecked import fetch count zero. Four isolated cycle/ownership/size/opt-out faults detected, restored-success passed. Existing queue-jobs/authority PG regressions passed after extraction.
- Actual localhost3000: nested folder/upload/metadata/search/trash/server-confirmed restore;1440/390 light/dark RTL scoped axe0/no overflow; author access/unrelated-staff/foreign-origin denial; CoverField/Escape/focus restore; WAV chunk/audio catalog/206 RIFF/Music reuse; real public immediate image/local200; import wizard opt-out marker/dry-run/scheduling controls; classic image alt/caption/320px/center. No owner article/track saved.
- Actual classic HTML scheduled image/video transfer: local stable link/original-source307, cancellation and preservation of typing during pending response.
- Full TypeScript,1917-file source/import, architecture/security/audit/schema parity/release manifest passed. Same HEAD dependency baseline1010→1025 modules,30→30 existing violations, zero added (not cycle-free platform).
- Doctor all19 affected React files:0errors/96warnings. Most are existing large Admin form complexity/effect fetching/labels/keys. New keyed inspector draft states, bounded/aborted polling and native-form prevention reviewed; existing RichEditor nested button/complexity and response-parser warnings remain follow-ups. No rules disabled; library axe does not certify old forms.
- Redacted Gitleaks changed/new task files (~906KB):0leaks. Existing scoped Semgrep dynamic-code rule initially eight transfer/storage files:0findings; narrow rule, not security certification.

Production `npm run build:postgres` passed with matching Prisma5.22 client and4GiB Node heap; existing CSS/autoprefixer/webpack warnings remain. Actual block-editor AssetControl selected the same catalog image and alt metadata into the canonical document draft. The owner's block-editor plugin was off: it was temporarily enabled for this test via its existing API, then its original disabled state was restored in finally. The first attempt correctly hit module-disabled; a later selector included the decorative icon before the successful pass. No document was saved.

Final Semgrep scope included ten library/transport/HTTP/JSON files, one existing dynamic-code rule, zero findings; existing future path-pattern warning remains. These are bounded checks, not a complete release/security certification.

Owned browser users/roles, unpublished block draft, transfer jobs, catalog entries/bytes/folders and owned remote ImportMedia rows were cleaned successfully. Existing catalog discoveries/owner files were retained. Local server remains on3000. No media policy settings were changed by tests; temporary block-editor activation was restored.

## Limits / future slices

Trash archives metadata; bytes remain for published content. Permanent purge requires reference-aware design. Direct files only, not recursive webpage/provider/HLS segment mirroring. Cancelled/revoked receive can leave safe unadopted bytes/existing image cache; adoption is fenced, no blind orphan purge. Existing protected public visuals/document formats/permissions remain. No all-section browser, whole-site WCAG, provider certification, full release suite, fresh backup restore or deployment claim. Continue existing owners rather than rebuilding.
