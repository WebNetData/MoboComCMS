# Reliability, compatible audio and engineering continuity — 2026-10-23

Continue `feat/reliability-media-admin-2026-10-23`, based on main68056743 (PR218).
On this machine it is `.mobocom/autonomous-foundation`; other clones use this
branch/current main normally. The older root contains separate owner work. Do
not replace this source with that tree or rebuild capabilities from its omissions.
Scenario: [SPEC](../../specs/reliability-media-admin/SPEC.md).

## Owners and contracts

### Journal notices

`journal/server/comment-notification-intents.ts` composes the existing Operations
enqueue primitive. Public auto-approval, staff approval and the AI-assisted staff
reply commit `journal.comment-published` with the comment change in one database
transaction. The AI-assisted path also claims the prior status and closes its
existing owner case. The worker calls the original comment notification service;
Inbox failures now propagate to Operations backoff/five-attempt failure handling.
Current publication and block rules, Inbox dedupe and its transactional channel
jobs remain. A partly delivered notice can retry without duplicate Inbox/channel
rows. No historical announcement backfill, new queue or identity system.

### Compatible audio

Public Media address remains `src/modules/media/server/library.ts`; private parts
remain under `library/`. Existing `/api/admin/media/library` adds same-process
commands `audio.inspect {assetId}`, `audio.create {assetId,revision,stream}` and
`GET ?view=audio`. Reads show the current manager's recent requests. Writes use
the existing actor, Origin, bounded JSON and a separate strict12/minute limit.
Only current Library managers (`media.manage`/`settings.manage` or full access),
not section authors, can process active public local Library videos.

Admin → Library → Settings owns `media.library.v1.compatibleAudio` (default false)
and `audioTimeoutSeconds` (default300, range30–420). Old settings clients preserve
these fields when omitted. Existing Media history includes them automatically.
Select a video, inspect its real tracks, choose a track and queue AAC creation.
The original is preserved; the new M4A is catalogued in the same logical folder.
Use its Library URL in the existing Cinema AUDIO link field, with the intended
access, and enable Cinema's existing separate-audio option. No automatic rewrite
of saved titles/links, remote fetching or video transcoding is added.

Installed ffmpeg/ffprobe run without a shell or inherited database/signing/provider
credentials, with local protocol/container allowlists, one encoder thread,
128kbps stereo48kHz output and a maximum declared duration of six hours. Intake
uses the existing Library size limit. A bounded private input copy, output
duration/codec/size checks, current authority/policy/source revision/fingerprint
and queue-attempt claims guard adoption. Temporary work is removed.
Adoption preserves Operations' lockedAt lease field; actual runQueue completion
is asserted, rather than only calling the codec helper directly. Registered
derivatives can be reused after an interrupted completion. An unregistered file
left by a process crash between file publication and database adoption is refused
for operator review, never overwritten or blindly purged. This is not a universal
codec/DRM service or an OS sandbox certification.

Deploy matching web/queue versions together: older workers retain unknown kinds
as FAILED. Fence/drain them before enabling the new work, and use the existing
Monitoring retry controls after upgrading. No database migration is required.

### Admin history and coverage

Livechat policy and section Maintenance join the same ContentRevision/history
owner adapter, strict transactional audit and optional If-Match contract. Existing
permissions remain: Livechat `support.chat`/`settings.manage`, module-gated;
Maintenance `settings.manage`. New clients send revisions and keep drafts on409.
Maintenance composes nested edits from fresh transactional state, preserving
other sections, other edited fields and future metadata. Its restore clears the
local maintenance cache. Chat histories contain policy only, not conversations.

`content/domain/history-forms.ts` is the shared UI address/label list for **21
named configuration owners**, not a permission resolver. History and the existing
Site Management directory use it. The directory can filter controls with history;
server guards still decide access. The multi-owner Extensions index deliberately
has no blanket history link; Business policy keeps its scoped card link.

This does not make arbitrary Admin forms or all component text restorable.
Orders/invoices/payments/wallet/stock, identity standing/ownership, provider
credentials, operational cursors and module lifecycle commands retain their own
audited commands. Additional safe configuration needs a named typed owner audit;
do not snapshot those states through a generic settings dump.

### Search measurement

The existing cap/index/ranking stay. `search-measure.cjs` now times the complete
JSON response, explains the current date/id scan, can save a local JSON report,
and always cleans up even if writing that report fails. `--catalogue=N` is an
explicit title-derived fallback, not visitor traffic. Existing `--real=N` replays
recorded queries. Both retain the local-only/scratch confirmation and rate limit.

A pg_dump/restore copy of the local database was served separately with all five
schedulers disabled.245 indexed documents,20 locally recorded queries, three
timed runs each after warm-up: request median18.32ms, p95 25.61ms, maximum33.94ms;
per-query medians12.04–24.87ms. Two catalogue-derived queries also ran. The clone
and its server were removed. These are development/local data, not public visitor
traffic, large-scale evidence or a production SLO. See [measurement](../../SEARCH-MEASUREMENT.md).

### DevStack

Pinned Graphify0.9.84 files/skills/privacy guard and Registry scripts are present
in this checkout for both project clients. Only Git-visible source code is indexed;
code-only extraction blocks network and excludes configuration/documents/secrets.
No global MCP config, app dependencies, scanner baseline or CI workflow changed.
Docker build context excludes nested tool dependencies and private `.mobocom`/
`.serena` state; an image build was not part of these checks.
Context7/Playwright and the existing JS TypeScript API are installed in the
separate locked `tools/devstack` prefix. MCP initialize/tools-list passed (2/25);
this is not a fresh model turn or provider/browser invocation through those MCPs.

Use `node scripts/check-devstack-config.cjs`, the existing supporting-skill
verifier, Graphify status/refresh/query/path/affected and the Registry benchmark.
The benchmark refreshes stale source, verifies the current optional-reader call
contract, dates its evidence dynamically and resolves its compiler from the
isolated tooling prefix. No estimated model-token savings. Current metrics and
limits: [DEVSTACK](../DEVSTACK.md). Old root scanner baselines are not assumed
valid for this checkout. Instructions route back here rather than duplicating
architecture in every skill.

## Executed evidence and limits

- Linux UID1000, no `.env`,129 empty-database migrations; existing example env
  templates are test fixtures, not loaded environment files.
- Eleven focused native PostgreSQL suites: journal-comment-notifications,
  journal-notification-intents, compatible-audio, admin-policy-history,
  section-maintenance, configuration-history, section-settings-history,
  content-management, moderation-rounds, player-subtitles and queue-jobs.
- Real AC3→AAC, original hash retention, current authority/default-off/stale source,
  invalid grant/stream/attempt, derivative reuse, child credential exclusion and
  signed-cookie legacy-settings compatibility assertions.
- Three isolated source faults were detected (ignored intent, missing audio
  manager check, omitted settings audit); source restored and native suites passed.
- Real localhost3000 Library settings/inspection/queue/worker/AAC playback,
  Maintenance stale409/draft retention/save/history, Chat save/history, directory
  filtering and direct Journal-only/support-only/foreign-Origin checks.
- Sixteen scoped1440/390 light/dark axe0/no-overflow views, screenshots inspected.
  The observed light active-day contrast failure was fixed without public CSS drift.
- React Doctor8 TSX:0errors/17 reviewed warnings; no suppression or global UI claim.

### Final local checkpoint

- `npm run check` passed:706 main tests,53 application/connected tests,4 backup
  tests and10 billing tests, with the existing type/architecture/security/i18n
  gates. The eleven native PostgreSQL suites above also passed separately.
- Final `next build` passed in the same non-root, no-`.env` Linux source snapshot;
  key final media/API/directory/test source bytes were compared with this checkout.
  This is a Next production build, not a deployed Docker image or production SLO.
- Gitleaks found no secrets in86 changed/new files. Scoped Semgrep's existing
  dynamic-code rule scanned26 production TS/TSX files, with no findings/errors;
  this limited scan is not a comprehensive vulnerability assessment.
- The final browser rerun included clearing the history-directory filter. All16
  themed views and actual AAC playback passed. Owned users/assets/jobs/versions/
  audit rows/bytes and private browser cookies were removed; changed policies were
  restored only against captured values. The app was restarted on3000.
- The isolated fresh migration/test database and search-copy dump were removed
  after validation. Wrong-database refusal for all three new optional suites was
  executed and passed before any connection. Existing owner databases remain.
- Current pinned DevStack/mirror verification,16 supporting skills/392 files and
  Graphify freshness passed. Registry4/4 static traces and11 owner tests passed;
  latest changed-source refresh27.880s, sampled process-tree working set
  1,028,677,632bytes, graph+cache23,994,052bytes. Agent token telemetry and a
  controlled Serena/CodeGraphContext comparison remain unavailable.

Raw local reports, screenshots and private fixture state stay ignored under
`.mobocom/reliability-evidence` and container `/tmp/reliability-*`. Native optional
suites require `mobocom_reliability_*`; guards and cleanup do not write to a wrong
database. No hosted Actions, push/PR/merge or deployment is part of this batch.
