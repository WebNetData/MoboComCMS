# AI core, continuous support and GitHub update reliability

2026-11-07, from owner-merged PR372/main9760532b. [Scenario](../../specs/ai-support-update-reliability/SPEC.md),
[Persian operator guide](../../AI-CORE-SUPPORT-FA.md). Existing AI/Livechat/Updater,
Settings/Identity/Audit/egress/package verifier remain canonical. No schema or
dependency change, new shared platform service, production deploy or release.

## Findings and delivered scope

- PARTIAL AI visibility: the existing purpose registry already integrates Admin
  tools, personal ChatGPT, reviewed/direct operations and isolated engineering.
  New `ai/server/readiness.ts` resolves effective per-purpose configuration for
  the current admin, returns no credentials, does not refresh/probe/call models,
  and distinguishes configuration readiness from operational proof. Existing
  routing API/Admin compose it and link existing tools/skills/support owners.
- REGRESSED continuous support: old reply cap, broad human-word matching,25s
  race against a120s provider and permanent WAITING on failure stopped later
  turns. `livechat.v1.continuous` defaults true, including existing settings;
  explicit false keeps the old cap. Requests after transient failures or while
  waiting remain answerable; assigned human chats are exclusive. Conditional
  transactions bind a machine reply to its triggering message, current unassigned
  BOT/WAITING status and latest message. Fresh module/settings checks prevent
  late publication. Human handoff also claims status rather than overwriting a
  takeover. Public support stays platform-specific,16 turns/600 output tokens,
  per-account facts, current rate/Origin checks and no personal Admin quota.
- Weak hidden retry budget: Claude no longer silently retries/switches model;
  support respects its600-token budget without adaptive-thinking inflation.
  Provider error details cannot echo into the public answer or chat log.
- DISCONNECTED update egress: feed fetched directly despite the updates profile;
  package installs had no explicit GitHub path; Git fetched every tag and could
  wait900s twice. New updater network owner uses existing updates egress for
  bounded20s/2MiB JSON and manual fixed-host asset redirects. Explicit refresh
  opts package installs in; passive status stays offline. Git helper fetches the
  announced tag only with default120s attempts. Stable signed-package download
  is separate from installation, bounded300s/512MiB, checks original root-pinned
  publisher and selected version through existing private upload admission.
  Locked/unprivileged users cannot download; audit records admission, no root
  installation is started by download. Existing backup/helper/lock/data remain.
- UI retains current SDS/MoboCom controls/themes/URLs. Adds readiness/help links,
  continuous toggle, ticket link and explicit GitHub download/feedback. Widget
  text links only local path references; no browser-global render branch. Typing
  timer ownership/cleanup is explicit; operator failures now show feedback.

## Actual validation

Owned Linux Node22 UID1000, no dotenv, separate176-migration PostgreSQL database;
all provider/release payloads and users synthetic. No production data, paid model
calls, live GitHub credentials or actual installation used.

13 initial focused Livechat/readiness/update cases and six existing AI-purpose
cases passed; the added Claude budget/no-retry/no-model-switch case passed.
Native Livechat continuity/placement and GitHub signed-package checks passed.
The latter uses actual Ed25519 verification, canonical unlock/scoped permissions,
database Audit, tamper and version-mismatch refusal and proves no install starts.
Focused Git helper tests passed for real stalled socket, proxy admission and
compiled-build retention. Type, architecture, source and security gates passed.
Final delta checks/source hashes and scoped security reports are retained in
ignored `.mobocom/ai-core-reliability/`; do not interpret initial results as proof
of a later modified file until the final receipt confirms its hash.

Actual browser: readiness/navigation/default continuous control; three answers
past a cap of1, transient provider error followed by successful next question,
explicit human request and AI while waiting; ticket route. Real password unlock,
explicit GitHub feed, real signed fixture admission and separate unclicked install
were verified. Feed503 retains the known release and releases the busy state;
customer direct AI-settings/updater calls are403. Four chat1440/390 light/dark
views and twelve affected Admin surface views have zero scoped axe violations,
no overflow or page errors. Synthetic screenshots were visually reviewed.
An early browser harness used an unsupported response clone, and its root-owned
failure marker could not be removed by the non-root preview; both fixture defects
were corrected. A later attempt to check optional setting-toggle persistence overlapped the final type process and exhausted the bounded preview memory; it timed out before navigation and is not claimed as passed. The task container was restarted without its preview and only the unfinished official type/gate commands resumed. Original services stayed running. No product security control was changed to pass the harness.

React Doctor initially detected the existing browser-global render branch and
typing cleanup ownership; corrected affected components now have zero errors,
27 reviewed existing warnings at that checkpoint. Final five-component Doctor has zero errors/29 reviewed warnings; scoped Semgrep and redacted Gitleaks returned zero findings/errors. Broad successful suites, release builds and hosted browsers
were not repeated. No claim of production network reachability or full autonomous
platform parity; host engineering remains its separately provisioned bounded path.

## Rollout and rollback

Owner merges/deploys. Installed1.7.7 scripts cannot pick up this fix before their
next update; use a newly versioned signed package manually for first adoption if
the old Git path stalls. Never replace published1.7.7 assets/tags. Root helpers
remain pinned and existing signature/backup checks are not bypassed. Private
repositories may still require operator repository access; no public secret form
or third-party download mirror was added. Downloads use only official GitHub
HTTPS hosts; proxy choice is the existing updates purpose.

Disable continuous mode to retain the old conversation cap; disable the AI/chat
module to stop its behavior while retaining data. Code rollback preserves current
keys/accounts/conversations/tickets and history; no reverse SQL/database restore.
No automatic campaign messages, deployments, wallet/payment/refund powers or
unrestricted host commands were introduced. Known provider/VM/systemd availability
and an installed worker remain operational prerequisites, not UI readiness claims.
