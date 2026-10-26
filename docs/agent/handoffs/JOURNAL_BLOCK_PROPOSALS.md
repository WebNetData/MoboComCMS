# Canonical body proposals and editor workspace — 2026-10-26

Authoritative checkout: `.mobocom/autonomous-foundation`, branch
`feat/block-proposals-editor-workspace-2026-10-26`, continuing `bea1fd49`.
Owner requested canonical article-body proposals and professional editor styling.
Continue [Journal review slice 3](../../specs/journal-review/SPEC.md); the earlier
[review reliability fixes](JOURNAL_REVIEW_RELIABILITY.md) remain in force.

## Ownership and contract

- Journal keeps the single existing `PostEditProposal`. Its `changes` can now
  carry `contentDocument`, a canonical MoboCom document JSON string. There is no
  second draft store, review queue, identity, permission or migration.
- `journal/server/body-proposals.ts` is behind the public `server/review.ts`
  address. `review-policy.ts` owns the same fresh Journal setting read, separate
  from commands so Editor and Journal do not acquire a runtime import cycle.
- Editor's `documents.ts` exposes shared `prepareDocument` and
  `validateDocumentRelations`; direct saves, submission and application validate
  the same schemas, bounds, current synced references and structural locks.
- `GET /api/admin/editor/posts/:id` adds `editingMode: live|proposal`,
  `proposalAt` and `proposalStale` for the current author while review is on.
  It reopens a pending canonical body and its actual live base. A stale body is
  retained for reading, with submission blocked until the manager returns it.
- `PUT` with `{ intent: "proposal", document, updatedAt, proposalAt }` explicitly
  submits. `proposalAt: null` means no prior proposal. Both tokens are checked
  under the canonical Post claim; re-read the proposal after that claim. A
  competing/replaced proposal or changed live base returns 409 `CHANGED`.
- Body submission leaves live HTML/document/version unchanged. Metadata and body
  retain one another on the same base; stale bodies cannot be silently rebased
  by a metadata save. Proposal clocks advance monotonically. Metadata-only
  historical behavior remains compatible.
- Existing manager apply/reject endpoint and permissions stay. Applying a body
  requires its proposal token and exact live base, revalidates the document and
  references/locks, regenerates HTML and commits body/metadata/history/audit/
  durable decision intent atomically. Legacy browser HTML is never authoritative
  beside a canonical proposal. Rejection leaves the live body intact.
- Manager-only `GET ...?proposal=1` renders a full read-only current/proposed
  comparison. HTML comes from the canonical renderer (legacy current HTML is
  sanitized). The same CMS proposal panel links to it; stale body apply is
  disabled in the UI and refused independently on the server.
- Body submit/apply require the block-editor plugin on; review-off authors still
  save live documents as before. The previous normal PUT cannot bypass review.
  Unknown blocks and English compatibility columns survive. Existing History
  restores the canonical body through its current adapter.
- The public CMS visit and existing page-cache Post flush share
  `journal/server/views.ts`. Parameterized atomic increments change only `views`,
  preserving the edit clock even when visits race. Before this fix an actual
  public GET reproduced a false stale base. No second counter store or schema
  was added; other modules' existing counters stay unchanged.

## Editor presentation

The shared block workspace now has a clear title/status/action header, grouped
insertion/history/sidebar controls, a writing sheet, settings/outline toggles,
Persian setting labels, explicit proposal notices, retained conflict work and
consistent rich-text controls. Mobile starts with settings closed; desktop opens
them. Existing MoboCom/SDS surfaces, fonts and light/dark identity stay.

The default Classic form editor also receives scoped Admin chrome and a single
primary toolbar with native expandable overflow. All previous full/basic tools
remain, in smaller groups; Visual/Text content is unchanged. TinyMCE 8 sliding
mode was checked against official version-8 documentation via Context7. No new
dependency/CDN/cloud key; GPL branding remains. The existing lightweight fallback
receives the same Admin spacing/control treatment when Classic is off. These
rules live in `components/editor/editor-chrome.css`, under `.admin-shell`; they
do not restyle public content or alter stored HTML.

The local owner's block editor was already off. Testing temporarily enabled it
and subsequently checked the real Classic and lightweight fallback paths. The
owner's original Journal/block/Classic settings are restored during fixture
cleanup; this feature does not silently enable a module.

## Executed evidence

- Fresh owned PostgreSQL, current migrations, Linux UID 1000 and no `.env`:
  `npm run check` passed **709 + 53 + 4 + 10 = 776 tests**, full types and existing
  architecture/source/schema/security/audit/i18n/migration gates.
- Final production build passed: compiled in **19.6s**, static pages **94/94**.
  It retains **43 build warnings**, including 39 dynamic-filesystem tracing
  warnings in existing code. These were not suppressed or presented as fixed.
- Native `journal-block-proposals` is registered as an optional isolated suite.
  Actual scoped Editor/CMS/History commands cover ownership/Origin/permissions,
  live preservation, body/metadata merge, reopen/preview, competing tokens,
  changed/rewound clocks, stale apply/reject, audit rollback and durable intent,
  existing History restoration, invalid/corrupt/locked documents, legacy-to-block
  proposals, unknown blocks, spoofed generated HTML, deleted synced references
  and plugin/policy-off behavior. Final restored-source pass succeeded.
- The native suite also exercises the real public CMS GET, eight concurrent
  counter batches and the actual page-cache `flushViews` with an isolated batch
  state. All 32 visits persist and the Post base stays unchanged; a pending body
  can still proceed through review. This is not a full cache-hit browser test.
- Existing native `journal-proposals`, `journal-review`, `editor-page-documents`,
  `editor-patterns`, `content-management` passed. `journal-review-reliability`
  passed in a second fresh database with its required owned name: prior
  single/bulk/owner/version races, worker backoff/DONE and Inbox dedupe remain.
- Three isolated source faults were actually detected, then restored: remove
  exact live-base apply refusal; remove proposal-token refusal; drop a pending
  body during metadata replacement. Final native pass after restoration passed.
- Maintained real-browser `journal-block-proposals.spec.ts`: **1 passed in
  21.2s**, actual author submit/no autosubmission/live preservation/reopen,
  manager read-only comparison and CMS apply, direct author decision/preview
  denials and actual 409 with browser work retained. Four MoboCom workspace
  light/dark 1440/390 states: no page errors, overflow or axe WCAG 2A/AA/2.1AA
  violations. Representative desktop/mobile/preview screenshots inspected.
- Maintained `form-editor-workspace.spec.ts`: Classic **1 passed in 12.8s**;
  lightweight fallback **1 passed in 8.5s**. Each visits light/dark 1440/390,
  types real Persian/mixed text, checks overflow/errors and scoped chrome axe0.
  Classic overflow opens/closes and Visual→Text→Visual preserves editing. Its
  iframe was actually typed in; scoped parent axe is not certification of every
  native dialog/iframe state. No form submit was needed for this CSS slice.
- React Doctor: 6 affected TSX, telemetry/supply-chain off, blocking error,
  exit 0, **0 errors / 11 reviewed warnings**, no suppressions. Diagnostics cover
  existing response parsing for error messages, bootstrap effects, complexity,
  list keys/helper exports/lookups and the responsive initializer. The latter
  is intentionally in a browser-only `ssr: false` adapter, preserving user panel
  choices on later resize; there is no SSR hydration mismatch from it.
- Scoped Semgrep: one existing local dynamic-code rule, 18 production files,
  0 findings/errors. Redacted Gitleaks exited 1 for one unchanged public RFC6238
  vector in `account-security.test.cjs:95`; independently confirmed unchanged,
  not a leaked credential. No ignore/baseline was changed; do not call it zero.
- Source-only offline Graphify refresh passed in **12.424s**, 2,099 source files,
  14,069 nodes / 52,599 edges, 23,587,546 graph bytes and 213,180,416 sampled peak
  process-tree working-set bytes. Semantic tokens: 0; no agent token-saving claim.
- The earlier PWA browser regression's two `inert` reads were narrowed to
  HTMLElement for the real full-project typecheck; runtime behavior is unchanged.
- Browser fixtures were removed and the exact original Journal/block/Classic
  setting values independently verified. Owned posts/users/roles/revisions/audit/
  search rows and editorial intents are absent. Private JWT fixture files and
  browser traces were removed; retained evidence contains screenshots and logs.
  The isolated PostgreSQL database and owned source copy were removed after
  retaining the 15 native/check/build/migration/fault logs privately.
- Local app restarted on port 3000: `/api/health/ready` returned 200 with database
  ready. All 20 owned production source files match the running `/app` copy.

Private raw logs/screenshots are under `.mobocom/block-proposals-evidence/` and
container `/tmp/block-proposals-*.log`. Early attempts are not passes: missing
fixture session claims and an already-disabled plugin, stale local Turbopack
cache (cleared only the verified build-cache volume), two new roleId typings,
a scheduling test's eager Editor import (made lazy), earlier PWA test typings,
observed light-theme contrast (fixed), and native toolbar readiness/selectors.
The final Classic test scrolls the real editor into view before its sticky tools.

## Repeat, rollout and limits

Run `node scripts/run-pg-checks.cjs journal-block-proposals` against an owned
migrated PostgreSQL database. Browser tests take an explicitly prepared local
`E2E_BLOCK_PROPOSALS_FIXTURE` with owned article/users/tokens, not an owner's
account; `E2E_AXE_PATH` enables the recorded accessibility checks. The block
scenario needs review/block enabled; the Classic/fallback scenarios exercise
their named existing plugin states (`E2E_FORM_ENGINE=rich` for fallback).

No public API/URL, permission key, dependency or schema changed. This is an
additive same-process Admin contract, covered by types/native/browser tests;
no independent-consumer Pact or public OpenAPI claim. Other themes, real mobile
OS keyboards and every other content form were not independently certified.
Provider/deployment readiness and Library `/files/` renditions remain separate.

Deploy matching Editor and Journal code together. Before rolling back to an old
binary that ignores proposal `contentDocument`, resolve/reject pending body
proposals; otherwise an old apply could silently drop that proposed body. Live
canonical documents keep their existing format and rendering with the plugin off.
The six unrelated owner CSS files remain byte-identical and outside this batch.
No hosted Actions, push, PR, merge or production deployment for this request.
