# SMS settings retention — 2026-11-05

Owner: existing SMS server/domain and `/admin/sms`, Setting `sms.config.v1`.
Branch `fix/sms-settings-retention-2026-11-05` from merged main `56850f43` (1.7.6).
Risk R3: credential/settings retention. No schema, provider protocol, dependency,
identity, permission or public visual change. Preserve stored secrets and settings;
only existing SMS owners write/send, with canonical settings permission and Origin.

## Findings and changes

The owner can read credit but gets the inactive-panel message when sending. They
report a successful save followed by empty key/sender inputs. The password input
intentionally clears and shows a masked stored key; an empty sender is a defect.

- The first browser attempt reproduced HTTP200 save with the actual stored flag
  false and sender empty. Initial GET/action reloads could overwrite form edits.
  Local draft versions now reject stale GET/save responses, and action reloads
  preserve edits. Changes typed during a save remain visibly unsaved.
- A250-character key encrypts to a380-character envelope. Reading it through the
  form's300-character input limit truncated the ciphertext. Persisted ciphertext
  now stays byte-for-byte intact; actual user input still uses the existing
  normalizer. AES-GCM and masked public output remain with the credential owner.
- Invalid sender normalization used to silently clear the line and report success.
  Invalid senders and enabling without sender/key are rejected before writing.
  Database/JSON read failures never become empty writable defaults. Readiness and
  hasKey require a decryptable key; manual errors distinguish disabled sending,
  unreadable key and missing sender. PUT returns the validation error to the form.

## Executed evidence

- Three new targeted regressions failed against old code and passed after fixing
  it. Existing payments/SMS file:11/11, Linux Node22/UID1000 without `.env`.
- Dedicated empty PostgreSQL applied171 migrations. Registered native
  `sms-settings`, `identity-otp`, `mobile-account-entry` passed. Actual crypto and
  database prove long-key save/read/masked resave, canonical sender, locally
  recorded manual delivery, invalid-save preservation and corrupt-read refusal.
  New fixture cleanup claims the exact last value and preserves concurrent work.
- Actual Edge save/reload retains enabled/sender and a masked250-character key;
  credit check preserves draft; invalid sender400 leaves persisted config intact;
  missing Origin and anonymous access403. Four1440/390 light/dark screenshots
  reviewed, no overflow, scoped axe0 and no page errors. The final browser flow
  passed after adding draft-version protection to the failed first attempt.
- Final TypeScript, architecture, source and security contracts passed. React
  Doctor on the affected page:0 errors. Scoped two-rule Semgrep on3 runtime files
  and redacted Gitleaks on6 code/test files:0 findings. All6 normalized final hashes
  match the tested Linux source; ignored evidence: `.mobocom/sms-settings/`.

No full release rebuild/repeated full-site suite, hosted workflow or production
deployment is claimed. Real IPPanel delivery was not attempted: native provider
delivery and browser credit were recording doubles, while database, crypto, API
save/read, browser state and access/Origin guards were real.

## Adoption and rollback

Owner merges to main; existing1.7.6 assets/tag stay unchanged. A later release is
required for normal adoption; the owner's installed site does not yet contain the
fix. If an earlier save already truncated a key or cleared a sender, enter the
original key and sender once after updating. Do not send the key in chat or change
`PANEL_CREDENTIAL_KEY`. Lost bytes cannot be reconstructed from a truncated value.
No migration/backfill or automatic credential repair. Rollback code preserves rows.


## Sitewide transactional SMS continuation - 2026-11-15

Continue `.mobocom/sms-platform`, branch `feat/sms-platform-2026-11-15` based on `72c03dd5`; the earlier Admin AI/users work was published as PR476, recorded OPEN/MERGEABLE to `main` for owner merge. The current slice extends the existing SMS owner through eight focused parts, not a second provider, settings store, or queue.

`SmsLog` gained an additive durable `dedupeKey` and HMAC `contentHash` in migration 205 (unreleased). A serializable claim reserves before provider I/O, with at most 12 automatic attempts per phone per day (OTP and explicit manual/test requests keep separate limits), duplicate protection for ten minutes, and bounded jitter under contention. Invalid configuration, caps, and read failures fail closed. Ambiguous sends end in terminal `UNKNOWN`, never automatic resend. Admin settings use revision CAS, strict audit, encrypted credentials and retained stored keys. Settings-manager HTTP routes enforce Origin/body bounds, filter and paginate reports, and redact secrets. `ORDER_STATUS` defaults off and checks Store module/preferences/mutes.

OTP issuance uses serializable phone/IP/resend limits with the existing challenge consumption and TOTP protections. Unknown delivery keeps the challenge and shows a visible warning; unchanged RESET response remains generic. Unconfigured SMS does not claim delivery. Configured delivery is required in development too; there is no raw-code logging or debug bypass. The new readiness regression passed. Manual, broadcast (maximum 500), Store and Forms sends remain bounded by current eligibility/opt-in; the Form stage/job transaction stores encrypted intent and rechecks current pickup, phone, receipt, stage and preferences before dispatch. No transactional phone becomes an auth identity or marketing consent.

Evidence actually executed: sequential isolated PostgreSQL checks on migration 205, UID1000/no `.env`, with provider recording doubles only: SMS settings, Identity OTP, mobile entry, Forms counter, Notification policy, core and workflow suites passed. 43 Forms/payments units and 10 scale/inbox units passed. Types, source, architecture, security, audit, schema parity, money-schema and manifest checks passed. Sixteen real app-browser views of SMS settings/events/reports/requests at 1440/390 light/dark passed scoped axe (0), overflow (0) and page errors (0); draft preservation, simulated 409 and simulated 503/load retry were checked. These are not real provider sends or production configuration mutation. React Doctor on four UI files: 0 errors, 8 reviewed warnings. One-rule Semgrep over 18 targets: 0 findings. Redacted Gitleaks over49 explicit changed/new files returned0 findings; no ignore/baseline change. A guard-removal mutant was detected in isolation; populated migration 205 preserved old rows in an isolated schema and was rolled back.

Initial parallel serializable conflicts were reduced to bounded 12-attempt jitter; test-fixture phone-null, adapted old settings-loader imports, mobile axe scroll-region and isolated migration harness cache/selector issues were corrected. Final browser rerun passed after transient navigation. Current app uses the existing container/image at port 3000, this worktree mounted, skip-seed enabled; local data stays in place. Exact fixtures and disposable database were cleaned; final source/readiness receipt is recorded in the SMS handoff. No real SMS/customer sends, hosted workflow, production release, PR for this new slice, merge or deployment. PR476 is prior work only; do not imply the SMS branch is in it. Rollback is source revert with migration history retained; never automatically replay ambiguous jobs.

### Final evidence and remaining operational limit

Eight additional actual browser views checked Login/PhoneStep unknown-delivery warnings, code entry and cooldown at1440/390 light/dark: scoped axe0, overflow0, pageerrors0. Their provider/HumanCheck/completion responses were recording fixtures; no authentication bypass or SMS occurred on the server. The harness initially interacted before login hydration; waiting for load and a real mode switch fixed its lost-input failure. A500-recipient queue check committed500 encrypted jobs in371ms, disclosed truncation of the501st recipient, performed0 provider calls, and removed only its fixtures. Schema parity, money rules and release manifest passed. Graphify refresh failed its out-of-corpus validation on existing CredentialPools.tsx; no fresh graph or semantic runtime claim. Source/Serena and actual checks remain authoritative. The unregistered historical notification-delivery script hard-codes a host database and failed in Linux; registered notification policy/dedup and inbox/scale checks passed instead, with no claim that that older script passed.

Both new suites are registered in run-pg-checks. The exact disposable PostgreSQL database, browser users/form/entries/logs and500 queued recipients were removed after private receipts were saved. Actual local SMS credentials, choices and data were preserved; new ORDER_STATUS and FORM_STAGE are offered in /admin/sms and remain opt-in. Real IPPanel acceptance/handset delivery still requires an operator's explicit test/activation; no real customer send was used as development evidence. Final source hashes/readiness after restart are recorded below by the lead. On rollback disable sending first, retain the additive columns and intent tombstones, and never roll back to a sender that blindly repeats an unknown attempt.

Final acceptance:41 affected source/schema/check hashes matched the running container; readiness/session/Admin SMS/homepage returned200 and migration count205, synthetic users/logs0. Follow-up removed the explicit debug-code path entirely: SMS readiness is required in every environment, no raw OTP logging,43 scoped Forms/payments units and full types passed. This follow-up changes no configured-provider flow. Current source is committed locally on the SMS branch; prior PR476 remains its separate owner-merge boundary. The container is retained on localhost3000; no release/hosted run or real SMS. Final restart is verified after the follow-up before handoff.


## Repair receipt tracking and purpose-specific OTP — 2026-11-15

Continue `.mobocom/sms-platform`, `feat/sms-platform-2026-11-15` from local
`3fba96c9`. The owner requests a printed repair status code, OTP access and editable
ready SMS texts for service/sales. This slice extends Forms and the shared SMS OTP
owner. No new identity, challenge table, queue, migration or dependency is added.
Prior Admin AI/users PR476 remains separate for owner merge; this slice is local.

- `/repair-status` and POST `/api/repair-tracking` offer a dedicated printed
  status-only code or receipt number plus its first current normalized transaction
  mobile/tel. A versioned 80-bit derivation from the existing random receipt token
  prints separately from the six-digit handover secret. Constant-time comparison
  checks current token, service/receipt enablement and non-SPAM status. Previous
  receipt QR links remain valid; old paper numbers can use OTP without a backfill.
- Exact `REPAIR:id` challenges reuse hashed OTP, expiry, shared issuance limits,
  five committed failed attempts and single-use consumption. Verification rechecks
  current contact/receipt in its serializable transaction. Expected wrong-code
  errors are handled inside that transaction so increments commit. Generic issuance
  responses do not distinguish matches, misses, disabled or uncertain delivery.
  No account/verified-phone update, persistent tracking session or credential URL.
- The dedicated customer DTO includes bounded title, current stage/label, received
  and created dates, customer reply and label-only steps. It never projects answers,
  locks, staff, pickup/receipt secrets, settings or money documents. Explicit Origin,
  HumanCheck, 3000-byte body, strict IP/receipt/contact limits and no-store responses
  protect the route. Each successful OTP authorizes only its response.
- `/admin/sms` adds independent login, verification, reset, counter and repair
  overrides with previews and draft-only ready texts. Shared encrypted settings,
  revision CAS, audit, allowed variables and global fallback remain authoritative.
  Approved pattern text stays in IPPanel; the local free-text preset does not
  rewrite it. Repair `{service}` comes from the trusted current form title.

Executed on actual isolated PostgreSQL205, Linux UID1000, no `.env`: registered
repair-tracking, SMS settings, core delivery and workflow suites passed; 45 scoped
Forms/payments units and full types/source/architecture/security/audit passed.
The new suite covers changed/rotated/wrong paper proof, handover-code rejection,
private DTO, current receipt/phone gates, generic send outcomes, purpose separation,
five committed failures, concurrent one-shot consume, no identity effects, template
persistence/masked roundtrip/fallback and HTTP guards. Provider functions were
recorders. Removing the proof check in an isolated source copy was detected; the
running source was unchanged. One-rule scoped Semgrep on eight targets found0.
React Doctor on four affected components returned0 errors/eight reviewed warnings:
three complexity, existing void-handled reload, duplicated label composition and
three stable receipt print-row index keys. No suppression or identity redesign.

Final browser, printing, secret scan, exact fixture cleanup and restart receipts
are appended after they execute. No real customer SMS/provider acceptance, physical
printer, hosted workflow, production build/release, merge or deployment is claimed.
Rollback this source slice retains existing receipt tokens, global SMS settings and
challenge data; purpose overrides are additive stored settings, with global fallback.
Operational provider activation/pattern approval remains an operator action.

### Repair tracking final local acceptance — 2026-11-15

Actual app3000 browser:28 scoped views at1440/390 light/dark passed axe0,
horizontal overflow0 and page errors0. Both paper lookups and OTP verification
reached the real API/database with actual HumanCheck; only request-code issuance
was intercepted to create a private synthetic challenge without provider I/O.
Wrong-code403, correct-code200/cleared input, resend cooldown, minimal result and
focus, receipt tracking link/code and hidden handover secret, repair/counter presets
and simulated revision409 preserving drafts passed. Each viewport represented a
distinct synthetic client IP; real rate guards were retained. Native issuance and
template writes separately used recording providers against isolated PostgreSQL.
No real provider response or handset delivery is established by this browser run.

Final A5 PDF was rendered and visually inspected: one page for the standard
three-field fixture, code/QR side by side, readable URL and signature boxes. Print
canvas stays white in dark theme. Long real answers/terms may require extra pages;
no content is hidden or scaled to force every receipt onto one sheet. No physical
printer was used. Light-text contrast and ready-text hover contrast were corrected
with existing accent-ink tokens after actual axe findings. The harness corrected
print-media leakage and waited for actual HumanCheck readiness before typing to
avoid pre-hydration lost input; final run passed. Docker Desktop had stopped between
turns; it was restarted using its CLI, preserving the app/image and PostgreSQL data.

Final native tracking/header privacy, types/source/security/audit passed. Success
and error responses both carry private/no-store and no-referrer. React Doctor
remains0 errors/eight reviewed warnings, and redacted Gitleaks scanned31 explicit
changed/new files with0 findings and no ignore changes. All exact browser fixtures
(users/forms/OTP) and the dedicated test database were removed after receipts were
saved under ignored `var/repair-tracking/`; app settings and user data were retained.
Final source hashes and readiness after restart are appended below. This is a local
source slice on the SMS branch, separate from prior PR476; no hosted workflow,
real SMS, physical-print certification, production release, merge or deployment.

Final restart receipt:23 affected source/check hashes matched the running container;
ready, repair-status, session, Admin SMS and homepage returned200. PostgreSQL remains
on205 migrations, and exact browser fixture users/forms/challenges are0. Existing
image `675416b1f3e7` and local container `mobocom-app` on port3000 are retained with
skip-seed; the final source slice is committed with this handoff on the SMS branch.
No real provider send or hosted/production action occurred.

## Owner-authorized PR476 consolidation — 2026-11-15

The owner requests a pull request for all work completed so far. GitHub PR476 was
verified open, unmerged and mergeable, with head `72c03dd5`; fetched `origin/main`
remains `58a67c81`, an ancestor of the four current feature commits through
`13a5190d`. Consolidate the local transactional SMS/repair slice into this existing
PR to `main`, rather than an overlapping PR. Publish the same final head under
`feat/sms-platform-2026-11-15` and PR476's existing
`feat/admin-ai-integration-2026-11-15` remote branch by normal fast-forward push.
Authoritative local source and Docker mount remain `.mobocom/sms-platform`.

The rewritten PR describes AI/users/UI, transactional SMS, the additive unreleased
`20270322120000_sms_delivery_claims` migration, repair code/OTP, purpose templates,
actual per-slice checks, provider/print limits and rollback. Previous statements
that SMS was local/separate describe the earlier handoff boundary. This publication
adds no runtime behavior; recorded PG/browser checks are reused, not represented
as rerun. Docker readiness was checked again and returned200. Owner merges/deploys;
no hosted workflow, real customer SMS, main merge or production release is performed.
PR: https://github.com/WebNetData/MoboComCMS/pull/476.

Repair consent continuation2026-11-15: separate decision-bound OTP reuses the shared
challenge owner with a trusted transactional beforeIssue check and post-commit
provider delivery. Public Admin revision is omitted, templates/keys/limits remain.
Full contracts, migration206, actual PG/browser evidence and rollback are in
[Forms handoff](FORMS_AND_OPERATIONS.md#repair-estimate-consent-promised-delivery-and-public-history--2026-11-15).
