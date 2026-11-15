# Commercial module isolation — owner2026-11-15

Owner reiterates that MoboCom is a commercial modular platform: customer-specific
capabilities are optional modules/plugins; inactive contributions must disappear
from ordinary Admin/public settings and direct server/worker entry points, retaining
data. This reinforces the existing architecture, not a new shared system.

Authoritative checkout `.mobocom/sms-platform`, branch
`fix/modular-capability-isolation-2026-11-15`, base main274ada62 after owner merge
of PR477. Earlier repair publication records are historical. Other checkouts and
private runtime/configuration remain untouched. [Scenario/inventory/roadmap](../../specs/commercial-modularity/SPEC.md).

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
