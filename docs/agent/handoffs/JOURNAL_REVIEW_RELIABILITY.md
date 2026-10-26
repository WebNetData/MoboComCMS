# Journal review reliability — 2026-10-26

Current continuation: [canonical body proposals and editor workspace](JOURNAL_BLOCK_PROPOSALS.md)
extend these same claims/intents and the existing Editor/PostEditProposal owners.
Both Codex/Claude workflows already route here; follow that handoff for the new
body contract, actual tests and plugin/rollback constraints instead of rebuilding it.

Owner request: fix both findings in the [progress review](../audits/2026-10-26-progress-review.md).
Continue `fix/journal-review-reliability-2026-10-26`, based on owner's `aef68618`
and its existing public-quality commits. Locally use `.mobocom/autonomous-foundation`;
resolve actual Git state instead of switching to old branch markers. The six
pending owner CSS files are separate and their bytes were preserved.

## Current implementation

- Journal's `server/review-state.ts` claims the exact Post id, authorId, status and
  server-read updatedAt through a conditional no-op update in the write
  transaction. It holds the row without advancing its timestamp before the
  actual write. A stale single save returns409 before category/link/revision
  changes. A fresh author's retry on a published article uses its existing
  proposal path. This is a claim on the server-read state, not a new editor
  version token or a claim to reject every stale browser tab.
- CMS single saves and Journal review/proposal services use that claim. Proposal
  submission also checks the current author. Before/after revision snapshots are
  read under the claim. Review/proposal decisions retain current permissions,
  allowed states, optional proposalAt behavior and original data/URLs.
- `server/review-bulk.ts` preserves bounded/per-item bulk results: a raced row is
  reported failed while eligible rows succeed. Pending decisions retain their
  publication-time rule and now record strict revision/audit plus a notice
  intent. Existing request limit remains100; a100-article native batch completed
  in498ms locally. This is not a deployment load/SLO measurement.
- `server/review-notifications.ts` queues `journal.editorial-decision` in the same
  transaction as explicit, normal-form, bulk and proposal decisions. Each
  committed intent captures a random decision UUID and original recipient/
  title/note/decision. Worker retries reuse that UUID as the Inbox dedupe key.
  Current Operations backoff, five-attempt failure and Inbox's transactional
  channel jobs remain authoritative; no new queue/table/permission/settings
  service. Self/absent authors retain their existing no-notice behavior.
- Delivery validates the captured payload and lets Inbox errors propagate.
  Interrupted completion after Inbox commits retries without duplicating the
  Inbox row or its three channel intents. Failed enqueue/audit rolls the owner
  change, proposal deletion, history and intent back together. Existing comment
  notice intents are unchanged; no historical editorial notice backfill occurs.

## Executed validation

- Fresh owned PostgreSQL `mobocom_review_reliability_20261026`, current migrations,
  Linux UID1000 and no loaded `.env`.
- `npm run check` passed:709 main,53 application/connected,4 backup and10 billing
  tests, plus its existing type/architecture/source/schema/security/i18n gates.
  The scheduling fixture gained the actual conditional-write delegate; the
  exact magazine-key allowlist names the new Journal bulk audit owner. No gate
  or assertion was loosened.
- Native `journal-review-reliability`, `journal-review`, `journal-proposals`,
  `content-management`, `moderation-rounds` and `queue-jobs` passed. The new suite
  is registered as optional because it owns the dedicated database namespace.
  Earlier review/proposal tests now run the actual editorial worker for their
  fixture recipient before asserting delivery; they never select provider jobs.
- Deterministic approval/single/bulk/version/owner interleavings, fresh proposal
  retry, actual Operations QUEUED/backoff/DONE, partial-Inbox replay, channel
  dedupe, normal/bulk/proposal intents, enqueue/audit rollback, invalid payloads
  and the full100-item batch passed.
- Three temporary source faults were detected by the native assertions: ignored
  state claim, enqueue outside the owner transaction, changed worker delivery
  identity. Files were restored and the native suites passed afterwards.
- Final Next production build passed with isolated dependencies and CLI inside
  the owned build root. Initial external symlink/CLI harness attempts failed and
  were corrected; they were not counted as passing builds. Existing43 filesystem
  tracing warnings remain; no tracing ignore or app configuration was changed.
- Scoped Semgrep dynamic-code rule:7 production TS files,0 findings/errors.
  Redacted Gitleaks:14 changed code/test files,1 existing RFC6238 public test
  vector at account-security.test.cjs:95, unchanged from base. The exact standard
  vector was verified; no credential, ignore rule or baseline was introduced.
  Do not report this scan as zero findings or comprehensive SAST coverage.
- Graphify source-only/offline incremental refresh passed (15.041s,0 semantic
  extraction tokens). It is discovery evidence, not runtime/token-saving proof.
- Wrong-database refusal ran before any connection. The owned database and
  temporary source/dependency copies were removed after checks; evidence logs
  remain private. The local app was updated with the seven tested backend files,
  restarted on3000 and returned HTTP200. All six owner CSS files retain their
  host hashes; generated app CSS differs only in line endings.

Raw local evidence: `.mobocom/journal-review-fix-20261026/`, container
`/tmp/review-fix-*.log`. No React/UI source changed, so no new React Doctor or
browser/a11y result is claimed. The owner's unfinished CSS acceptance remains
separate. No hosted Actions, push, PR, merge or production deployment in this fix.

## Rollout and continuation

Deploy matching web and Operations workers together. Old workers preserve the
unknown new kind as FAILED; upgrade/fence them and use existing Monitoring retry
controls. No database migration or app dependency update is required. For app
rollback keep queued decisions, do not purge them; delivery may wait for a
matching worker. Continue through the same Journal/CMS/Operations/Inbox owners.
Do not recreate these fixes from the historical open-finding paragraphs.
