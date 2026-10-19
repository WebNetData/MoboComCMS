# Remaining gaps — scoped snapshot, updated 2026-10-19

Admin integration follow-up: main64134402's framework pins and the owner's
Admin batch are combined locally; CSS isolation, observed contrast/labels,
Audit hydration/stale-response behavior and selected actual workflows are
verified in [the continuation](handoffs/ADMIN_INTEGRATION.md). These named
items are closed within that scope. Remaining Doctor warnings, untested Admin
states and operational evidence below are not implied complete.

This is a prioritised follow-up to the editor/maintenance review, not a certification of every domain or proof that an untested capability is absent. Existing production URLs, section permissions, canonical services and protected visuals stay in force. VPN/reseller/marketplace remain outside the chosen product focus.

## Before launch: verification and operational evidence

The release checklist, backup/restore tooling and monitoring already exist. The remaining work is to execute and retain evidence on the intended staging/production setup: complete buyer/payment/return flow, real configured delivery channels, backup restoration and deployment/rollback rehearsal. See `docs/RELEASE-CHECKLIST.md`, `docs/POSTGRESQL-BACKUPS.md`, `docs/OPERATIONS_MONITORING.md` and `PLATFORM_DECISIONS.md` §8. The [first autonomous safety batch](audits/2026-10-10-autonomous-release-safety.md) passed local check/build, fresh PostgreSQL/Redis and encrypted restore rehearsal; it verified a magazine-only manager saving/reopening metadata and block body. The release-safety PR rerun passed the full registered browser suite (55 passed, 7 fixture-dependent skips, zero failures/retries), plus all six affected editor cases after the contrast fix. Other section-specific acceptance paths, forum split/merge/polls/private messages and staging/production operational evidence remain outstanding. See the [release-safety audit](audits/2026-10-10-release-safety-pr.md). Local results do not certify production or external integrations.

## Confirmed feature gaps, in suggested implementation order

| Priority | Gap | Existing owner and evidence | Safe next slice |
|---|---|---|---|
| 1 | Synchronized patterns, role-specific templates and future custom layouts remain beyond the verified independent templates/patterns/structural locks | Browser descriptors, live bounded rendering, manual selection, unknown/module-off retention and plugin-off public rendering are now implemented; [continuation](handoffs/MODULE_BLOCKS_SETTINGS_HISTORY.md) | Audit a named new composition requirement before extending the existing registry. Shared LibraryPicker already exists; do not rebuild it or store catalogue snapshots. |
| 2 | History outside named content and twelve configuration owners is not universal | General/Forum, five portals and the audited Studio/Navigation/Media intake/Notifications/Business policies have typed atomic history; complete canonical JSON is validated; [current scope](handoffs/AUTHORING_TOOLS_MEMBER_LISTS.md); [continuation](handoffs/MODULE_BLOCKS_SETTINGS_HISTORY.md) | Audit the next named owner form and its sensitive/state fields. Never rewind money/stock/ownership or capture provider secrets. |
| 3 | Production-size search latency/memory and live-result changes need deployment measurement | Date/rating ordering and approved-only dimension filters are implemented;1105-candidate local sample/next-page correctness verified | Measure actual deployment data/query distributions with existing bounded search, not another index/rating store. |
| 4 | External moderation effects and delivery retain existing transaction boundaries | 2026-10-19: copyright decisions now take down items/links, record the decision, close the moderation case and write the audit in one Serializable transaction; missing items are logged, events follow the commit (`copyright-decision.connected.cjs`). The reporter learns the result by the existing code+email status page, so no outbound delivery can be lost there. Other owners' external effects are still to be assessed one by one. Immutable rounds, populated history migration, trusted requeue and stale-round checks are implemented; [continuation](handoffs/AUTHORING_OPERATIONS.md) | Assess a named copyright/notification delivery failure through the current owner/outbox. Do not infer runtime delivery from a case record. |
| 5 | Universal codec/ASS fidelity, historical people notifications and production delivery are not certified | People curation, retained-alias merges, Cinema follow/notices, styled ASS and separate audio are implemented and locally verified; [scope](handoffs/CONTENT_MANAGEMENT.md) | Evaluate a named unsupported format/delivery requirement through current media/jobs/providers; do not rebuild the player/favorites or imply browser transcoding exists. |

Closed locally in the [current continuation](handoffs/AUTHORING_TOOLS_MEMBER_LISTS.md): scheduled editorial collections, shared Library cover selection and member-list controls on detail pages. Recommendation-quality measurement and consented viewing-history signal remain. These are not a reason to rebuild the existing collections, lists, search, playback or recommendation services.

All legitimate configuration joins the existing Admin Control Plane. Priority1–5 entries incorporate the selected authoring/operations and module-block/settings continuations; unrelated capability rows were not re-audited. [PR197](https://github.com/WebNetData/MoboComCMS/pull/197) is owner-merged at main741e7176. Its hosted jobs could not start because of GitHub billing/spending limits. The owner requested publication of the separate module-block/settings branch to main; no workflow rerun or new production certification is implied.

## Runtime observations to audit

The combined HTTPS suite retained repeated analytics visitor and notification deduplication constraint logs, alongside unconfigured demo subscription providers. Source confirmation for analytics: `analytics/server/collect.ts::recordPageview` uses create-and-catch for an already counted daily visitor and catches every insertion error. Audit the existing database insertion helper before replacing that path; preserve atomic once-per-day visitor counts and expose unexpected database failures. Notification behavior and provider operation were not re-audited from those logs alone. This is follow-up work, not a failure of the passing forum/buyer assertions or production certification.

## Next bounded development slice

Update 2026-10-10: the [real buyer/return journey](audits/2026-10-10-buyer-return-runtime.md), magazine-only editor and [independent forum restriction slice](audits/2026-10-10-scoped-restrictions.md) passed on compiled HTTPS/PostgreSQL, with wallet/code/refund invariants and inspected light/dark/mobile views. Final combined browser: 57 passed, seven fixture skips, zero retries; eleven related PostgreSQL cases passed. Initial failed attempts and TLS/hostname/throttle/contrast/pool corrections remain documented. The existing browser workflow uses this runner; [PR #147](https://github.com/WebNetData/MoboComCMS/pull/147) is owner-merged and all hosted gates ultimately passed (browser57/seven skips/zero retries), with no manual dispatch. The [refunded-order explanation](audits/2026-10-10-refunded-order-status.md) is fixed. Real configured providers and named staging/deploy/rollback remain P0. Broader global/resource/capability restrictions still need the existing Identity/AuthZ owners and assessed session/token/background consumers. Do not infer a new checkout/returns or identity system is needed.

The [buyer/payment/return release scenario](../specs/buyer-return-release-evidence/SPEC.md) now has a separate actual internal-wallet order/delivery/refund browser flow. The earlier checkout-response stub remains a client retry test and is not counted as payment evidence. Next prove the named HTTPS/PostgreSQL production configuration and real providers; extend the bounded forum restriction foundation through the same Identity/AuthZ owners. Existing services are reused and broader unassessed capabilities remain unassessed.

Delivery checkpoint: [PR #146](https://github.com/WebNetData/MoboComCMS/pull/146) merged after required checks passed; production limits above remain.


CI browser follow-up: PR #146 passed the configured gate with 53 direct passes, 2 flaky cases that passed on retry, and 7 fixture-dependent skips. The flaky cases were `/music does not crash` and the magazine-only section-manager save. Local full suite passed 55 cases without retries. Reproduce and stabilize the CI-resource behavior without weakening assertions or adding retries; then continue the real buyer/return scenario. No additional workflow was dispatched.

2026-10-11 runtime follow-up closed the source-confirmed analytics duplicate/partial-counter issue and canonical notification dedupe noise through existing owners, with real PostgreSQL/SQLite concurrency and rollback, check638/build/browser58 evidence. The new malformed-JSON/no-store and bootstrap permission-reset/race defects are also fixed; no historical counters, roles or accounts reset. See [analytics](audits/2026-10-11-analytics-integrity.md), [notifications](audits/2026-10-11-notification-integrity.md) and [bootstrap](audits/2026-10-11-bootstrap-permissions.md). Earlier observations are historical; unconfigured demo providers and named operational deployment are still not certified. Next extend the existing restriction records/Identity guards across authenticated sessions/API consumers after their bounded spec and compatibility audit. Other domain gaps remain.

2026-10-11 authentication foundation: canonical GLOBAL identity.authenticate records now deny existing/new sessions and API keys in the fresh-main development branch, with PostgreSQL, check638/build and final5 compiled browser cases. Normal login denial no longer becomes500; historical failed attempts retained in [the audit](audits/2026-10-11-global-authentication.md). Global restrictions remain PARTIAL: former raw-token ads/repository/forms are now closed with [current-account evidence](audits/2026-10-11-current-account-consumers.md). Other upload/download/contextual/realtime/user-acting jobs, narrow recovery exceptions and authorized Admin issue/history/revoke remain. The secret repository rate-limit floor and bounded Import execution authority are now implemented on the fresh-main foundation branch: [secret quotas](audits/2026-10-11-repository-secret-limits.md), [operator/provenance/rollback/generation evidence](audits/2026-10-11-import-execution-authority.md). Other human/resource/machine entitlement consumers and the global Admin workflow remain assessed following slices; do not infer comprehensive completion. Root :3000 authentication source/schema/client rollout is still pending; no global mutation API enabled.

## 2026-10-11 — human-bound Repository machine access

The fresh-main branch now checks explicit license owners through current canonical Identity before activation, ACTIVE certificate, deactivation or paid download. Temporary423 preserves existing client/installed state; unbound grants/free downloads and bounded REVOKED invalidation remain. Actual PG/no-effects, five deliberate faults, check638/build and compiled HTTPS20 pass. See [evidence and compatibility limits](audits/2026-10-11-repository-license-owner.md). Broader upload/context/realtime/user-job policies, Global Admin workflow and safe consolidated :3000 rollout remain pending; GLOBAL maturity is still PARTIAL.

## 2026-10-11 — masked file grant authority

Fresh-main masked file grants now carry explicit viewer identity from media/Music/watch issuers and recheck standing/GLOBAL before clean cache or upstream. Legacy/guest bearer TTL and direct/excluded origins remain explicit compatibility boundaries. PG/fault probes/check638/build and compiled21/two fixture skips including genuine local WAV browser playback pass; [evidence and limits](audits/2026-10-11-masked-file-authority.md). Global Admin issue/revoke/history through existing staff/audit guards is next, with remaining resource/context/recovery consumers to assess and safe consolidated :3000 rollout still pending.

## 2026-10-11 — Global restriction administration

Bounded canonical Global Admin issue/revoke/private history is locally complete on the foundation branch: existing users.manage/staff/audit guards, current transaction authority, independent records, themed account card and no user/financial/forum reset. Seven PG owners/single connection, six fault probes, check638/build, final compiled22 and scoped axe/light/dark/mobile pass. [Evidence and limitations](audits/2026-10-11-global-restriction-admin.md). Broader resource/recovery/context/groups policies, existing customer-page23 diagnostics, all-instance matching source/schema deployment and lifecycle/theme/editor/domain roadmap remain open. No Actions or :3000 rollout.

## 2026-10-11 — Telegram authority / modern account merge

Bounded Telegram standing/GLOBAL, ordered transaction locks, initial uniqueness retry and retained restriction/license ownership are locally verified. [Evidence](audits/2026-10-11-telegram-authority.md). Actual owned PostgreSQL reproduced healthy placeholder merge deleting UserProfile/public username. Audit modern relations and collision-safe preservation next; full merge remains WEAK_BACKEND. No production data or :3000 rollout, provider sends or GitHub Actions.

## 2026-10-11 — Profile loss protected

The preceding reproduced UserProfile/username deletion is fixed on foundation: exact profile transfer when target has none, collision and unsupported actual FK/inspected scalar/preference refusal before effects, actual money rollback and unchanged public URL verified. [Evidence](audits/2026-10-11-telegram-merge-safety.md). Comprehensive modern transfer, scalar reference/write fencing, source metadata reconciliation and deployment remain PARTIAL. Preserve conservative refusal until those contracts are proven.

## 2026-10-11 — Extension state write integrity

Actual concurrent field loss and partial legacy mirror write are corrected on foundation with current Serializable transaction readers/retries. [Evidence](audits/2026-10-11-extension-state.md). Broad lifecycle remains PARTIAL: corruption fallback writes, multi-query read snapshots, independent legacy writers, opposing dependency switches, package publication/compensation and queued effects need evidence. No provider traffic or production/:3000 rollout or Actions.

## 2026-10-11 — Extension corrupt storage and snapshots

The preceding corrupt-state overwrite/per-node mixed-state gap is corrected on foundation. Strict mutation parsing preserves bad JSON/shapes/legacy fallback, each node/public runtime gathers declared fields in one query. [Evidence](audits/2026-10-11-extension-state-integrity.md). Ordinary read fallback, invalid scalar mirrors/other legacy shapes, whole dependency-read consistency outside mutation, independent legacy writers, lifecycle audit/publication/compensation and queued effects remain bounded open scope. No production/:3000 rollout or Actions.

## 2026-10-11 — Queue row ownership

Stale execution and concurrent retry/dedupe ownership corrected on foundation; actual SQL races and three meaningful source faults verified. [Evidence](audits/2026-10-11-queue-lease.md). In-flight effects, follow-up enqueue, current human manual-job authority, module-specific queued reconciliation and old-worker rollout barrier remain open. No production/:3000 rollout or Actions.

## 2026-10-11 — Manual queue authority

Manual monitoring commands now persist canonical operator grants, recheck current Identity/settings.manage/fresh 2FA at dispatch/batches/continuations, fail closed on recognized damaged envelopes, and retry with explicit current operator plus atomic strict audit. [Evidence](audits/2026-10-11-queue-authority.md). Unmarked system/domain obligations stay under their existing policy. In-flight effects, old unmarked continuations/whole corrupt payload repair, broader module reconciliation and lifecycle publication/compensation remain open. No production/:3000 rollout or Actions.

## 2026-10-11 — Module admission availability

Known module admission/public projection now fail closed on unavailable or corrupt existing state; healthy missing-row/mirror defaults remain, unrelated valid nodes stay independent. Existing Store opt-in additionally composes canonical availability. [Evidence](audits/2026-10-11-module-availability.md). Actual all-optional-off homepage/Core API and explicit Forum reactivation tested. Ordinary private-plugin/other legacy readers, whole corrupted-state recovery, lifecycle commands/atomic audits/compensation/version publication and rollout remain open. No whole-site total-database-outage claim or financial cancellation.

## 2026-10-11 — Package persistence

Existing package/index/theme aggregate persistence corrected with actual concurrent PostgreSQL and rollback/browser evidence. [Evidence](audits/2026-10-11-package-integrity.md). Lifecycle command ownership/atomic audit, multi-action PATCH, independent Site Studio writers, version/compatibility and executable effect compensation/recovery remain open.

## 2026-10-11 — Package PATCH command

Verified combined PATCH and strict audit gap corrected; [evidence](audits/2026-10-11-package-command.md). Other command audit/effect/current-human contracts and production rollout remain separate; this does not certify whole extension lifecycle.

## 2026-10-11 — Package PATCH current authority

Canonical transaction/current-authority/retry gap corrected with actual native and signed-cookie compiled evidence. [Evidence](audits/2026-10-11-package-authority.md). Other package commands/default policy cache/external in-flight effects and operational rollout remain separate.

## 2026-10-11 — Direct package commands

Current authority/atomic strict audit extended from PATCH to direct upload/file/delete/restore routes, with native and compiled evidence. [Evidence](audits/2026-10-11-package-crud.md). Repository-client/source import/apply, external compensation and operational recovery remain separate.

## 2026-10-11 — Builtin source import

Current authority/strict audit and retained staged edits corrected for builtin source import. [Evidence](audits/2026-10-11-package-source.md). Repository installs, apply/recovery/external effects remain separate.

## 2026-10-11 — Repository installation

Atomic package/receipt/audit/current actor and signed archive binding/core corrected with native and compiled evidence. [Evidence](audits/2026-10-11-repository-install.md). Download-time module/config/license changes, provider races, apply/recovery remain separate.

## 2026-10-11 — Download-time repository state

Module/connection changes after admission now deny transactionally, with controlled real HTTP/SQL evidence. [Evidence](audits/2026-10-11-repository-admission.md). Paid certificates/provider changes, other commands and apply/recovery remain separate.

## 2026-10-11 — Current paid install entitlement

Local download-time entitlement changes now reject atomically. [Evidence](audits/2026-10-11-repository-entitlement.md). License-map command races and remote provider recovery remain separate.

## 2026-10-11 — Current license-map commands

Local map claims/current authority/audit/package revocation verified. [Evidence](audits/2026-10-11-repository-license-map.md). Provider reconciliation and other commands remain separate.

## 2026-10-11 — Signed Repository refresh subjects

Correct-signature wrong product/site no longer replaces the local certificate or disables its package. [Verified evidence](audits/2026-10-11-repository-refresh-subject.md). Docker interruption recovered; fresh build and compiled31 passed after restoring the disposable hostname. Provider reconciliation/other commands and full roadmap remain.

## 2026-10-12 — Current Repository connection commands

Connection/disconnection current-authority/config-race/atomic-audit gap corrected with native50/PG13/check/build and compiled HTTPS34 evidence. [Audit](audits/2026-10-12-repository-connection.md). Vendor mutations/provider reconciliation, apply recovery, operational rollout and full roadmap remain pending. No Actions/root source rollout.

## 2026-10-12 — Vendor license administration

Current authority/atomic strict audit and lost concurrent extensions corrected with native39/PG14/check/build/compiled39. [Evidence](audits/2026-10-12-repository-vendor-licenses.md). Vendor product/config/release/files, public machine races and purchase debit/license atomicity remain distinct scope; payment consequences are code-inspected, not yet fault-proven. No Actions/rollout.

## 2026-10-12 — Atomic Repository wallet purchase

New purchases now retain one debit/license/sale or fully roll back, with native15/current authority/true overlap, monetaryPG22/check/build/compiled43. [Evidence](audits/2026-10-12-repository-purchase.md). Historical orphan payments are refused/retained and still need explicit reconciliation; vendor files/public machine races, broader roadmap and operational rollout remain pending. No Actions.

## 2026-10-12 — Explicit Repository purchase recovery controls

Original payment/date retained; manual reviewed restore/refund/current dual permission/audit/mixed-race guarantees now have native39/PG23/compiled47/Doctor/axe/light-dark-mobile evidence. [Audit](audits/2026-10-12-repository-purchase-recovery.md). Existing integrity diagnostics and ambiguous records remain open. Docker IO interruption recovered operationally; underlying disk cause not claimed fixed, C about3GB free. No Actions/source rollout.

## 2026-10-12 — Repository diagnosis in existing integrity report

Single checked policy is now consumed by actual Admin recovery and existing Node report, bounded all-history/cursor continuation, safeID samples, read-only22/PG25/CLI17/check/build/compiled47 evidence. [Audit](audits/2026-10-12-repository-purchase-diagnostics.md). Explicit decisions for ambiguous records, remaining vendor/files/operational lifecycle and wider roadmap remain. No Actions/source rollout.

## 2026-10-12 — Vendor catalog/configuration

Current database-only product/configuration/publish writes and strict audit are atomic under existing Identity/module owners. Native29/PG20/check639/build82/compiled47 evidence; [audit](audits/2026-10-12-repository-vendor-admin.md). Delete/unlink and upload/SQL compensation, public/provider concurrency, operational package lifecycle and whole launch roadmap remain open. No Actions or source rollout.

## 2026-10-12 — Vendor archive effects

Existing delete/upload now preserve licenses and referenced archives, recheck authority/versions, commit strict audit and compensate only owned unreferenced files. Native29/PG10/check639/build82/compiled47 evidence [audit](audits/2026-10-12-repository-vendor-files.md). Crash/orphan recovery, public machine/provider concurrency, package application and launch remain open; SQL/files are not one transaction. No Actions or source rollout.

## 2026-10-12 — Archive recovery diagnosis

Shared read-only inspector now connects existing CLI/Admin, explicit filesystem/hash mode, bounded retained pages/cursors, safe filenames/type/identity checks and current permission before/after I/O. Native23/CLI17+21/PG7/check639/build82/compiled48 [evidence](audits/2026-10-12-repository-archive-diagnostics.md). Diagnosis does not grant mutation: durable upload reservation/phase fencing is required before reviewed quarantine/restore/resume. Age alone cannot protect paused uploads. Public machine/provider/package effects and whole launch roadmap remain open.

## 2026-10-12 — Durable upload fencing

Existing release owner now reserves STAGING before files and finalizes only exact owner token; public/Admin projections READY-only, active publish/delete refusal, strict reserve/final/cancel audit. Migration preserved207 old releases, native33/fencing5/migration2/PG10/check639/build82/compiled49 [evidence](audits/2026-10-12-repository-upload-reservations.md). Reviewed recovery, actual process kill/restart and all-writer rollout remain; old unreserved orphans cannot be inferred dead. Existing owner download checksum check is absent and separately pending, along with provider/package/platform roadmap. No Actions/source rollout.

## 2026-10-12 — Buyer archive integrity resolved

Inspected owner checksum gap is fixed in the existing function, healthy behavior preserved and corrupt/missing bytes refused before counting. Native8/PG4/check639/build82/compiled50 [evidence](audits/2026-10-12-repository-owner-integrity.md). Reviewed recovery and real process interruption, all-writer rollout/public machine/provider/package/platform work remain. No Actions/root rollout.

## 2026-10-12 — Actual upload process interruption

Owned writer SIGKILL at reserve/partial/full-write checkpoints plus a fresh observing process passed, leaving hidden STAGING and original bytes/rows; native3/PG4 [proof](audits/2026-10-12-repository-upload-crash.md). Application unchanged; no new build/browser claim. Reviewed immutable-copy promotion/quarantine/restore, whole-system recovery/all-writer rollout and platform scope remain.

## 2026-10-12 — Reviewed completion API

Same vendor Control Plane now owns default-off archive recovery flag, current reviewed evidence and exclusive immutable-copy promotion. Native18/live+SIGKILL2/PG7/check639/build82/compiled51 [proof](audits/2026-10-12-repository-reviewed-recovery.md). Operator UI, reversible quarantine/restore and all-writer/whole-system rollout remain; no raw orphan cleanup or blanket production completion.
