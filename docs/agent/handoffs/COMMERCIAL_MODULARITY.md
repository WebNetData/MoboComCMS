# Commercial module isolation — owner2026-11-15

Owner reiterates that MoboCom is a commercial modular platform: customer-specific
capabilities are optional modules/plugins; inactive contributions must disappear
from ordinary Admin/public settings and direct server/worker entry points, retaining
data. This reinforces the existing architecture, not a new shared system.

Current continuation is `.mobocom/package-lifecycle`, branch
`feat/package-lifecycle-recovery-2026-11-23`, based on fetched main `bcdfbdc7`.
Use the2026-11-23 package compatibility/source-apply section below. The original
2026-11-15 isolation implementation used `.mobocom/sms-platform`, branch
`fix/modular-capability-isolation-2026-11-15`, base main274ada62 after owner merge
of PR477; those receipts remain history. Other checkouts/private configuration
remain untouched. [Scenario/inventory/roadmap](../../specs/commercial-modularity/SPEC.md).

## Evidence-based audit and implemented boundary

The inspected base has42 manifests:37 modules and5 plugins. The existing generated
catalog, extension Setting state, dependency resolver, packages aggregate/index,
typed Admin paths, Identity and Audit are canonical. Actual source gaps were Forms
and Automation without manifests, unguarded Forms routes/effects, direct AI client
pages, inactive settings shown in the manager, and destructive active-package
deletion. Other domains' complete disabled journeys remain unassessed, not certified.

- New `plugins/forms` owns the optional Forms/services capability, including repair
  intake/receipts/tracking/estimates/decision OTP/history. `plugins/automation` owns
  rules and CRM engagement. Both default on to preserve existing installations.
  Domain logic stays in the existing Forms/Automation owners; Store/Billing still
  own money. The generated catalog now has44 entries. `instore` remains a separate
  composition: counter intake needs both Forms and instore; counter sales do not
  depend on Forms.
- Forms HTTP/page/domain guards cover ordinary read/write/files, public forms,
  checkout admission, repair/tracking and account requests. Current transactional
  availability checks protect submission, correction, work, estimate, consent and
  invoice admission. Delayed save/duplicate/bulk/upload writes recheck before DB
  effects; a newly created upload is removed if registration fails. Existing
  financial settlement and privacy/temporary-upload retention remain available.
  `fulfillFormOrder` can claim an already-paid request while off, then skips optional
  communications. No estimate/consent/data reset or new schema migration.
- Forms contributions disappear from account ordering/navigation, embeds, Studio,
  service/CRM/warranty compositions and active editor registry. Existing
  `content.form` retains its type/version/document data and gains its owner;
  inactive editor blocks remain stored. Public Site config hides Forms home sections
  without rewriting the saved document. Server layouts gate Forms, counter, account
  requests, AI and Automation trees. Shared services remain when another owner runs.
- Automation gates admission, scans, execution and individual outward effects.
  Pending events belonging to an inactive target remain pending; no new events are
  admitted while their owner or Automation is off. Disabled scans/actions leave
  choices/recipes; stored rules/history remain. CRM enqueue checks state in its
  transaction; delivery policy blocks already queued marketing. Forms stage SMS
  jobs reconcile to a skipped no-send result. Shared SMS rechecks the optional
  event owner before reservation and immediately before provider dispatch; login,
  verify and reset transport stay Core. An effect already dispatched externally
  cannot be retroactively cancelled.
- Extension manager reports requested versus effective availability, dependency
  blockers and unreadable configuration from a consistent transaction snapshot.
  Inactive ordinary settings/history/manage links are withdrawn; Core lifecycle
  recovery controls remain. Built-in versus uploaded/staged code is explicit.
  Generic extension PATCH uses bounded JSON, current transactional settings.manage
  and strict Audit; businesses keeps its existing specialized owner. Dependency
  cycles fail catalog validation. No parallel permission or settings resolver.
- Uploaded inactive uninstall is a retained `uninstalledAt` field in the same
  package aggregate, with revision invalidation in the existing index. Enabled
  plugins and selected themes must first be deactivated/replaced. Applied code
  receipts cannot be removed through staging-package deletion. All ordinary readers
  (runtime, pages, assets, editor, export, activation, source and file writes) reject
  retained-uninstalled rows. Repeated uninstall is idempotent; validated reupload
  restores current manifest-defined settings and revision history, staying inactive.
  There is no purge operation. Built-in code removal and trusted source changes
  still require a reviewed compatible build/deploy, not a pretend runtime installer.

## Executed local verification

Fresh disposable PostgreSQL206 migrations, Linux UID1000, no `.env`, isolated source
and schema-compatible existing generated client. `modular-capabilities.connected`
passed actual off-route/domain denials, current authority/audit rollback, no-send
effects, pending-event retention, Core paid reconciliation, editor withdrawal,
retained uninstall/runtime/asset/editor refusal and inactive reinstall. It also
pauses save validation, recipient delivery and DNS while disabling Forms and proves
later writes/effects stop. Deliberately replacing Forms domain availability with
true makes the check fail; isolated source was restored byte-for-byte, never applied
to the running app.

Repair approval, tracking, counter, invoice; extension state/integrity, module
availability, editor module blocks; package integrity/CRUD/command and CRM engagement
connected regressions passed as recorded in ignored receipts. TypeScript, source,
architecture, security and Audit checks passed at the recorded source snapshots.
76 scoped Forms/payment/package/routes units passed. No automation connected script
exists under the guessed name; that attempted command is not a pass. Existing
Automation pure suite passed17/17 separately.

Initial checks exposed fixture/loader issues: paid fixture needed positive stored
amount; package examples were missing from the isolated runtime; the route loader
did not resolve relative SMS template imports; two preexisting source assertions
assumed pre-guard/direct-db syntax. These were corrected without removing the
permission/concurrency assertions. Package regressions now assert active-uninstall
refusal and retained index semantics instead of destructive deletion.

Read-only independent review found delayed preflight writes and post-DNS/recipient
effects, fixed and exercised above. No additional introduced retained-reader bypass
was found; this is source review, not separate runtime evidence. Graphify refresh
failed its existing out-of-corpus CredentialPools.tsx; exact source supplied mapping.
Lead Serena manual/activation succeeded; some delegated calls timed out. Two bounded
implementation workers could not run due to model usage limits; lead implemented
the source. No unavailable worker output is represented as implementation evidence.

React Doctor0.9.17 reviewed12 changed client components:0 errors,36 reviewed warnings
(existing complexity/fetch/index/parser/Studio iframe patterns and bounded state
forms; no suppression/dependency upgrade). Scoped one-rule Semgrep31 server targets
found0. Redacted changed-file Gitleaks initial74-file snapshot found0. These are
bounded checks, not a general security or whole-platform certification.

Private source/database backups preceded adoption on existing `mobocom-app` image
and127.0.0.1:3000. No schema migration, real SMS/mail/provider call, hosted workflow,
production build/release, PR, merge or deployment. Local continuation below.

## Continuation and rollback

Next: actual-core compatibility and consumed version/capability dependencies for
all installation channels; recoverable idempotent code-apply effects; remaining
domain/module-off coverage and commercial Solution Packs/distribution/entitlements.
Shared SMS authentication transport is Core; optional messaging features still need
their own scoped commercial boundary. Unknown `support` module literals and the
broader dynamic module mappings require reconciliation before making every unknown
module id fail closed. No claim that all platform development is now independently
installable, or that trusted uploaded source is sandboxed.

Keep all canonical data and existing business keys. Do not downgrade to readers
that republish/edit retained-uninstalled rows, or bypass active repair consent.
Retain guards or freeze affected writes until compatible code returns. Reactivation
and reinstall are explicit. Never reset historical money or purge retained data.

## Final browser and cleanup receipt —2026-11-15

Actual Edge/Playwright at localhost3000 accepted26 views:1440/390, light/dark,
manager on/off, SMS without Forms, Automation off, customer ordering and restored
public form, plus active/retained-uninstalled uploaded package. Each scoped axe
report has0 violations and horizontal overflow is false; captured runtime errors0.
Actual UI PATCH toggles, direct page withdrawal/API404, absent disabled repair OTP
choices, AI off/API denial, preserved Core/session/settings, inactive settings
withdrawal, active uninstall refusal, exact uploaded public page/editor withdrawal,
retained content/settings and validated inactive reinstall were exercised. Screenshots
and nonsecret receipts remain ignored under var/modular-isolation. Three final
captures were inspected visually; this is scoped evidence, not whole-site WCAG proof.

The initial light active filters/counts and warning chip failed contrast; scoped
extensions.css fixes passed the final run. A Next development-worker memory
threshold restart interrupted an earlier browser run; local-dev-start.sh now uses
a6GB default only when NODE_OPTIONS is absent, preserving explicit operator values.
The final26-view run completed after the same existing container restarted. No
Docker image, port, mount, persisted configuration or data volume was replaced.
Earlier harness failures (controlled-checkbox timing, unsupported fixture template,
Next streaming not-found HTTP200 and selector scope) are not counted as passes.
Off-page checks inspect rendered unavailable content; guarded API checks require404.
External provider origins were blocked and no real provider send occurred.

The final manager-only Doctor rerun passed0 errors/5 reviewed existing warnings
(fetch error-payload parsing, bounded array lookups and existing numeric settings
inputs); the earlier12-component0-error/36-warning report remains. No suppression.
Browser fixture cleanup used a serializable transaction and current-value claims
for the three module switches, removed only its own uploaded package from the
current index and advanced its revision, retaining unrelated entries. Exact owned
users/form/submission/audit rows were removed. The exact disposable PostgreSQL
mobocom_modular_test_20261115 was dropped and its private environment/cookies removed;
44 named nonsecret connected-check receipts were preserved. Private before-source
and populated-database recovery backups remain ignored. No customer rows purged.

Final freeze passed76 named normalized source/check hashes against /app after the
same image/port restart; readiness/session/repair-status/home200, anonymous Forms
Admin403,206 completed migrations, task fixture counts0 and task DB absent.
Source syntax/import3009 files, architecture boundaries and14-document AI knowledge
integrity passed again. Final redacted Gitleaks scanned83 named changed files with0
leaks (the preliminary repeated scan used the older staging copy and is not the
final-source receipt). Nonsecret var/modular-isolation/final-runtime.json records
runtime evidence. This checkpoint is
local development; the owner still merges and deploys. Do not infer commercial
distribution/version compatibility completion from this first corrected slice.

## PR publication — owner request2026-11-15

[PR478](https://github.com/WebNetData/MoboComCMS/pull/478) was opened non-draft to
main from fix/modular-capability-isolation-2026-11-15, implementation c2d82426 based
on freshly fetched main274ada62 (0 behind/1 implementation commit ahead at opening).
The body records scope, previously executed PostgreSQL/browser/security evidence,
retained data/rollback rules and outstanding commercial lifecycle work. This
following documentation-only receipt records publication; no application code or
runtime configuration changed and no test rerun is claimed. The existing local
Docker preview remains on3000. No hosted workflow dispatch, merge or production
deployment was performed; owner merges and deploys. Earlier no-PR notes describe
the pre-publication checkpoint.

## Package compatibility and recoverable source apply — 2026-11-23

Owner authorized the proposed compatibility/recovery slice and asked to complete
it. Authoritative checkout is `.mobocom/package-lifecycle`, branch
`feat/package-lifecycle-recovery-2026-11-23`, from freshly fetched main `bcdfbdc7`.
The earlier sms-platform/PR478 routing is history. This slice is locally implemented
and verified within the contracts below; no PR/push/merge/deployment/provider send
or hosted workflow was performed. Root and autonomous-foundation local work remain
untouched. [Scenario/change envelope](../../specs/commercial-modularity/SPEC.md).

### Owners, implemented contracts and recovery

- Existing Platform Extension contracts own a bounded stable exact/caret version
  comparison, including caret zero-major bounds. Packages format preserves and
  validates `requires`, optional `dependencyVersions` and `requiresCapabilities`.
  Server compatibility compares the actual artifact core and installed module
  contracts. Upload/source/repository install, manifest editing, activation and
  apply consume it; source generator and example installer validate before source
  publication. Repository incompatibility retains its HTTP409 contract; ordinary
  package validation retains HTTP400. No semver dependency or registry was added.
- Existing effective extension state withdraws incompatible/missing/cyclic
  dependencies without changing requested state. Admin displays compatibility
  reasons. Package pages/assets/editor components/slots enforce the same contract;
  runtime cache keys and filtering use one dependency snapshot. Active theme edits
  check SiteConfig selection, not the plugin enabled flag. Disable/data retention,
  canonical Identity, permission keys and Core financial settlement stay intact.
- Packages retains `codeApply` in its existing aggregate, with operation ID,
  immutable file/target fingerprints, plan, phase and nonsecret deployment receipt.
  The existing Setting store holds one source-writer claim. Prepare/each step/final
  receipt recheck current `extensions.code` and strict transactional Audit; external
  effects never run inside a retried database callback. Pending operations refuse
  edits/upgrade/uninstall. Terminal receipt, Audit and claim release commit together.
- Git saves one prepared commit before a non-force ref update; an uncertain reply
  resumes by commit/ancestry observation. An unclaimed deploy request can resume;
  claimed/unknown dispatch never repeats. A commit/webhook acceptance is not proof
  of deployment. Explicit cancellation cannot revert a published commit or guess
  an ambiguous original-head outcome; only prepared/no-change or demonstrably
  diverged plans can be cancelled. New reviewed apply is then possible.
- Local apply prepares a whole directory on the same filesystem, retains the old
  directory under `var/package-code-apply/<operation>/previous`, verifies ordinary
  paths/bytes and regenerates registries. Both rename boundaries resume. Explicit
  cancellation retains withdrawn bytes and restores only the recorded original;
  durable cancellation intent survives interruption/Audit failure. A normal resume
  finishes the prior cancellation instead of applying replacement bytes again.
- A database lease alone cannot revoke a paused filesystem rename. Expired local
  runner takeover requires matching Linux boot/PID namespace and hostname plus
  proven process death. A live process, unknown namespace or unavailable proof
  fails closed; an operator must establish shutdown in cross-host/container-restart
  recovery. No automatic kill, lease-only takeover or unrestricted recovery bypass.
  Ordinary Windows local operation remains supported; automatic proof across a
  crashed Windows process/unknown namespace is not certified by this Linux test.

### Executed local evidence and earlier failures

- Prepared a fresh task-only PostgreSQL database with all206 migrations and a
  NOSUPERUSER role; native checks ran on Linux Node22 as UID1000 without `.env`.
  `package-apply.connected.cjs` is registered in the existing PG runner. It passed
  prepare/final/cancel audit rollback, current authority revoke, interrupted apply
  and compensation renames, stale receipt and stale runner races, pending mutation
  refusal, live/unknown/dead-process claims, single history/final claim release,
  Git lost reply/drift/ambiguity/divergence/cancel/ancestor paths, deployment-claim
  failure/unknown no-resend, core/dependency capabilities and active-theme rejection.
- Deliberately removed the pending-mutation guard only in private source: the
  connected acceptance failed with a missing expected rejection. Restored the
  original bytes/SHA256 and the full connected acceptance passed again.
- Existing package command, source import, integrity, CRUD, authority, repository
  install, extension-state integrity and module-availability checks passed on the
  task database. Focused package/repository/examples/builder/content/routes units,
  full TypeScript, source/import, architecture, security and Audit checks passed;
  final count/freeze receipts follow after the last bounded parser unit and docs.
- Actual Edge/Playwright accepted8 scoped views: pending/applied at1440 light/dark
  and390 dark, cancelled at1440 light/390 dark. Real UI upload/refusal/resume/cancel,
  persisted once-only apply/cancel, original source retention, replay and guest/
  wrong-permission/foreign-Origin/invalid-action denials passed. All accepted scoped
  axe reports had0 violations, overflow false and0 page errors. Four desktop/mobile
  screenshots were visually inspected. This is not whole-site WCAG certification.
- React Doctor0.9.17 reviewed the two affected client components:0 blocking errors,
  8 reviewed warnings (existing fetch error-payload parsing, bounded array/numeric
  controls, client-only settings form and PackageManager complexity). No suppression
  or dependency change. Initial Linux Doctor command had no installed CLI; initial
  host invocation returned EINVAL under resource pressure. Serial host execution
  with telemetry/supply-chain calls off succeeded; failed runs are not passes.
- Initial native wrappers failed resolving relative JSON imports; loaders were
  corrected without removing authority/concurrency assertions. The running version
  now uses the artifact package file once, matching existing updater semantics.
  Earlier repository incompatibility incorrectly became400 before its existing
  callback; a typed compatibility conflict restores409 and native acceptance passed.
- Browser found a real empty-POST regression after bounded-body admission. The
  shared parser's explicit `allowEmpty` option preserves strict defaults elsewhere;
  malformed/oversized JSON still refuses. That actual route then passed browser
  resume/replay. Preview/tunnel interruptions and a host allocator failure were
  environmental failures, retained separately; final8 views completed in resumed
  phases. Only the exact-cwd task preview was restarted with a smaller heap. The
  original app3000 was independently rechecked200 and was not replaced/restarted.
- Scoped existing local Semgrep rule over23 source targets and redacted Gitleaks
  over39 changed/new files initially reported0 findings. Final scans include the
  final source/docs below; no whole-security or production build claim.

### Limits, continuation and rollback

There is no schema migration, live GitHub commit/webhook/provider send, production
build/release or deployment proof. External Git behavior is a controlled service
double plus actual database owners; multi-host process-death proof needs operator
evidence. Source apply is trusted build preparation, not arbitrary runtime install.
The wider commercial distribution/entitlement and customer Solution Packs roadmap
remains separate; this does not promote the whole platform to ProductionVerified.

Rollback must retain operation/claim guards or freeze source writes until all
pending work is reconciled. Do not downgrade to readers that discard codeApply,
republish retained-uninstalled packages or bypass active repair consent. Use the
explicit guarded cancellation before withdrawing pending local work; published
Git source needs its normal reviewed revert/build/deploy. Retain original/withdrawn
directories, settings, package revisions and historical money; no purge is added.

Task helpers, synthetic sessions, screenshots and logs remain ignored under
`var/package-lifecycle-20261123`. Final source comparison and identity-checked
cleanup receipts are appended below only after they execute.

### Final freeze and cleanup — 2026-11-23

- Final selected unit suites:181 passed/0 failed/0 skipped. Recovery connected
  acceptance passed again after final source corrections, including stale receipt
  cancellation and active-theme off-dependency editing; repository install retained
  all current-authority/receipt/audit/signed-identity cases and original409 conflict.
  Full TypeScript,3022-source syntax/import, architecture, security and Audit gates
  passed; generated44 extensions/4 code themes and seven registry outputs checked.
- Matched4056 source/check/schema/config inputs before runtime removal:0 content
  mismatches and0 unexpected source files. Exactly seven generated registry/CSS
  files differed only by CRLF/LF; both raw and LF-normalized hashes were recorded.
  Manifest SHA256 is `49e887471f0be482e3a97d5cec17f6255a8e67825611bf68fd10561f29d4b508`.
  This is source/check parity, not a production-build/artifact receipt.
- The first freeze failed because `docker cp` made generated files root-owned,
  Next dev had amended only the private tsconfig, and Git-less registry checks saw
  Windows CRLF. Corrected ownership of exact task files, restored the checkout
  tsconfig, generated/checked registries normally, and reran recovery/hash acceptance.
  Failed freeze and transport logs are retained; no checker was weakened.
- Only after successful source/browser/guard receipt checks, stopped exact-cwd
  task preview/bridge, removed `/tmp/mobocom-package-lifecycle-20261123`, dropped
  only `mobocom_package_lifecycle_test_20261123` and its NOSUPERUSER role, verified
  task DB absent, and removed host private session/DB files and the owned archive.
  Original app3000 readiness and session endpoints were actually rechecked200.
  Nonsecret screenshots/logs/receipts remain; no owner content/settings were purged.
- Final existing local Semgrep rule scanned24 source targets:0 findings/0 errors.
  Redacted Gitleaks scanned49 named changed/new files:0 findings. No baseline or
  suppression was changed. Local Git records this bounded implementation only;
  there is no full production build, live provider/commit/deploy or hosted workflow.
