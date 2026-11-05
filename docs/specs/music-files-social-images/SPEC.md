# Music transfer names/tags and social featured images

Owner request2026-11-05: new copied music uses the foreign artist/song names, embeds MoboCom + Mobocom.net in its tags, exposes Admin settings, and includes the featured image in Telegram/Instagram posts.

## Change envelope (R3)

Music owns file naming/tag policy under existing `music.portal.v1`; Media owns the durable transfer/snapshot/authority/queue, Downloads owns bounded transport, file publication and the reusable MP3 writer. Social owns post composition/JPEG conversion, using canonical Content item cards and Media public-image resolution; Notifications keeps the existing Bot API/Xray transport. No new downloader, queue, credential store or content model.

New `MediaTransfer.musicMetadata` is an additive JSON-string snapshot with artist/title/album/quality. Existing rows default to `{}` and retain their behavior. Existing bytes, asset keys, URLs, settings metadata, permissions and queues stay intact.

## Scenarios and controls

- `/admin/music/settings`: independently switch transferred-file renaming and tagging; edit tag brand and HTTP(S) site address. Defaults on, `موبوکام`, `https://mobocom.net/`. Existing section history, strict fresh CAS, optional revision claim, audit and restore are reused. Existing Music/settings managers retain their authority.
- Form transfers resolve the selected artist's stored foreign name server-side; the form supplies the song's foreign title and audio-field quality. Imports supply their resolved artist and effective track title through the same existing transfer service. Missing foreign names fall back to the available content names. Without both names, keep the source naming behavior.
- New recognized audio files use `Artist - Song - 128|320.ext`; the quality suffix is present only when supplied. Simultaneous collisions get numbered suffixes through exclusive publication, with no overwrite. Capture once for immediate/queued/scheduled transfers; execute with fresh settings so disabling applies to queued work.
- Rewrite MP3 tags without touching MPEG bytes. M4A/FLAC/OGG/OPUS/WAV use bounded, non-shell ffmpeg stream copy. The canonical title/artist/album remain content metadata; comment/site URL carry the configured brand/address. Other formats are unchanged. Failed tagging never becomes READY. A trusted completed-transfer marker prevents legacy download-time cleanup from rewriting those tags.
- Telegram `includeImage` defaults true and is configurable under `/admin/social`. A featured cover is normalized to JPEG and uploaded as multipart bytes through the existing Bot API/proxy. A photo failure retries the photo instead of silently recording a text-only success. Items without a cover, or explicit image-off, keep text delivery.
- Instagram continues to publish through its existing item-key JPEG endpoint, using the same safe resolver. Public local images are read directly, including ready transfer URLs; remote images use existing bounded, socket/DNS/redirect-guarded transport. Preserve the full image in a 1080×1350 canvas. Draft/hidden/module-off items remain unavailable. Real Instagram retrieval requires a reachable public HTTPS site and configured provider credentials.

## Acceptance and recovery

`scripts/music-files.connected.cjs`: actual PostgreSQL/HTTP, canonical names, durable snapshots, ID3/audio bytes, physical ffmpeg tags/decoded audio when installed, collision races, disable, settings CAS, bad files and actor revocation. `scripts/social-images.connected.cjs`: real item cards/JPEG/HTTP response/multipart serialization and PostgreSQL queue, doubled provider transport, failure backoff, image-off, draft/module-off and SSRF refusal. Registered in `run-pg-checks.cjs`. A deliberately wrong filename and restored silent photo fallback must fail these checks.

Existing media-library, social-queue, section-settings-history and import-field-inputs regressions; full local `npm run check`; real themed 1440/390 browser, save/reload and form transfer; scoped React Doctor/SAST/secrets review. Evidence/limits: [handoff](../../agent/handoffs/MUSIC_FILES_SOCIAL_IMAGES.md).

Rollback uses the two Music switches and Telegram image switch. Published files remain immutable and old source/content URLs remain valid. The new column can remain through app rollback; never remove migration history or rewrite previous releases.
