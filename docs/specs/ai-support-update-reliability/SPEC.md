# AI support and GitHub update reliability

Owner request2026-11-07: continuous platform-specific support, independent human
ticket assistance, integrated configurable AI and a working Admin GitHub updater.
R3: external networking, customer context and executable update admission.

Evidence: AI has canonical per-purpose routing, personal Admin accounts,
reviewed/direct operations and isolated engineering/skills. Extend those owners.
Livechat currently stops at maxBotReplies, hands off permanently after failures,
uses a25s race against a120s provider, and treats generic support words as human
requests. Updater's feed bypasses the existing updates egress; package installs
cannot explicitly check/download GitHub packages; Git fetch can wait900s twice.

Implementation envelope:
- AI: secret-free per-purpose configured readiness, no probe/model calls on GET;
  saved selection remains authoritative, support never uses personal Admin grants.
- Livechat: continuous response default, bounded16-turn context and600-token answer;
  optional legacy cap, transient failures retry on next user message, no automatic
  paid fallback. Explicit human/ticket paths remain. A late model cannot overwrite
  a newer visitor turn, human takeover, module disable or changed bot setting.
- Updater: explicit GitHub check/download for signed-package installs; retain
  manual upload and no unsolicited package-install network checks. API/releases
  use existing updates egress, strict fixed GitHub destinations/redirects, bounded
  bytes/time and original publisher verification/admission before installation.
  Download does not install; existing backup/unlock/Origin/permissions/locks apply.
  Git helper fetches the selected tag only with bounded waiting and HTTP1.1 retry.
- No source fork, second queue/auth/settings/AI client, dependency or schema reset.
  Owner merges/deploys. No live credentials/provider usage or hosted dispatch.

Acceptance: reproduce continuous-turn/provider-failure and feed/proxy/stalled-body
faults; focused units, native PostgreSQL late-reply/privacy/module guards and
signed-package admission; real browser settings/chat/failure/ticket and Admin
explicit release check/download with synthetic providers/releases. Run affected
types/architecture/security, Doctor on changed React and scoped scans once. Retain
actual evidence/limits and operator rollback in the handoff. No repeated full
release build or successful broad suites for this slice.
