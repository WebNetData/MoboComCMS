# Reliability, compatible playback and engineering continuity

Continue main68056743; preserve existing module owners, public design, URLs and data.

## Selected slices

- Journal: commit a comment-notification intent in the existing BackgroundJob queue in the same transaction as publication. Worker failures retry through Operations, with Inbox dedupe and current publication/block checks. No new queue/table; no replay of historical private content.
- Search: measure the existing capped search against an isolated copy of current local data and queries. Keep the owner's 5,000 cap. Report dataset/query provenance and absent production evidence honestly.
- Cinema/Media: provide an opt-in, queued compatible AAC audio derivative for an authorized local Library video using installed ffmpeg. Preserve the original; reuse Library, Operations, Cinema separate-audio links and current access guards. Admin controls policy; unknown or unsafe input fails closed. No arbitrary remote fetch or universal codec claim.
- Admin: inventory existing history owners and extend named safe configuration forms through ContentRevision, their own current guards, version claims and atomic audit. Never restore secrets, money, ownership, delivery cursors or module lifecycle state.
- DevStack: reconcile project-scoped Graphify and skill routing in the authoritative checkout; keep local-only code indexing, pinned tools, Codex/Claude mirrors and concise canonical continuation documents. Do not copy an old product tree or index configuration/documents.

## Verification

Each slice gets focused native PostgreSQL checks and deliberate failure probes where they protect an invariant. Relevant types/architecture/source checks run after coherent changes. Visible Admin/player changes require actual 1440 light/dark and390 browser/axe checks and affected React Doctor diagnostics. Search results are measurements, not correctness tests. No hosted workflow dispatch, deployment or universal production certification.
