# Private AI engineering and recovery workspaces

2026-11-07; base owner-merged PR367/main6e6f58b9. Owner: AI can develop and
create PRs automatically; production promotion always needs the owner's explicit
approval. Existing one-request direct content tools keep their separate policy.

Audit: AI has provider/purpose routing, encrypted personal Admin grants, bounded
six-command proposals and strict audit. Operations owns the persistent executable
BackgroundJob queue and captured/fresh human authority. Server Panel owns
server.manage, environment/IP/password/TOTP unlock and fixed host tools. Updater
owns backups/update locking and rollback, but current native scripts rebuild in
place/restart; these are not a zero-downtime development sandbox. Existing skills,
architecture/map/ledger/handoffs are canonical source; product runtime does not
currently provide coding, workspace or skill management.

Extend AI with private EngineeringRun history and bounded, inert custom skills
in canonical Settings/CAS/audit. BackgroundJob remains the executable queue.
Server Panel `/api/admin/server/engineering` uses all four existing locks plus
settings.manage and ai-assistant module state. No public/customer tool can enter.
Every queued step rechecks canonical UserId, auth epoch, standing, both permissions,
2FA policy, module and current engineering enable switch. Only the requesting
operator can approve/cancel their run; authority expires in24h. Development is
explicitly requested, not an unattended code-changing monitor.

Flow: request repair/feature/diagnosis → frozen policy/selected skill hashes →
private clean branch at current main → bounded repository discovery/read → model
JSON file edits → isolated checks and one build → durable report/architecture
record → commit/push/PR targeting main → owner reviews/merges → owner explicitly
approves that exact validated artifact for production → candidate ready/HTTP check
→ graceful reverse-proxy switch → readiness verification/automatic code fallback.
Model output is data, never shell/SQL/root commands. Diagnosis is read-only host
resource/HTTP information; bounded recovery proposes one fixed runbook with a separate diagnostic-hash/runtime
approval. Code repairs use the development path.

Versioned host protocol uses fixed actions and run IDs. A root-owned installed
broker/configuration controls repository, credentials, dependency image, build
limits, production environment/uploads, proxy include, backup tool and slots.
App invokes the fixed local Unix broker (with a fixed-helper fallback). Build code executes
as non-root inside a capped network-isolated container with no production DB,
secrets, socket, root filesystem or live directory. Dependency/host/deployment/
schema changes are outside automatic promotion; PR or operator maintenance path
must resolve them. Never execute workspace package scripts on the host.

Builtin knowledge is a reproducible generated runtime bundle from actual
mobocom-* skills/architecture, not a second architecture. Include mandatory
invariants and select relevant excerpts/custom skills under a text budget. Custom
skills are bounded plain instructions, versioned/hash-pinned per run; they cannot
override authorization, sandbox or release policy. Admin can add/edit/disable them.
Model calls/steps/files/context/output are bounded; retry reuses checkpoints and
never repeats a successful build or PR. Report measured text/call budgets as
such, not fictitious provider-token accounting. No unrequested full release suite.

Every source patch checks its original hash, normalized safe path, regular file,
size and allowed scope; traversal/symlinks/secrets/binary/host files are refused.
Changes update existing architecture/map/ledger with a run handoff containing
actual check receipts. Failed checks keep the current site untouched. Cancellation
revokes work; stale queue workers cannot advance a cancelled/revised run. PR
publication and deployment use root-owned receipts for crash/replay reconciliation.

Blue/green promotion is opt-in host setup, leaving the initial native instance
alive. Require configured proxy, available headroom, exact merged-main tree,
sealed successful checks, a fresh backup receipt and explicit current approval.
Keep previous runtime for code rollback; verify candidate DB readiness then switch
the existing proxy gracefully. Rollback changes code/routing only and never
restores an old DB over new customer data. Schema-changing/incompatible versions
must not claim safe automatic downgrade. An unavailable helper/unsupported host
shows actionable setup state rather than a simulated success.

Incremental additive migration in both schemas and release manifest; existing
orders/content/settings retained. UI reuses current ServerShell/unlock, Admin
tokens and RTL responsive forms: request/type/skills, status/diff/check evidence,
PR, separate exact-artifact promotion confirmation, rollback history and budgets.
Credentials and complete logs never enter model/user responses.

Acceptance: bounded pure path/protocol/plan/policy cases; native PostgreSQL
identity/denial/CAS/audit/replay/cancellation checks with isolated host responses;
host fixture tests for isolated arguments, source hash conflicts, build failure,
PR replay and blue/green failure/rollback without DB restoration. Deliberately
break fresh authority and approval/artifact checks. Actual Admin browser at1440
light/dark and390 with scoped axe/loaded states. Types/architecture/source/schema/
manifest/security and exact tested hashes. No live server, account, spending,
hosted workflow or production deployment during this implementation.

Implementation details and actual verification/limits are in
[AI_ENGINEERING](../../agent/handoffs/AI_ENGINEERING.md). Production executes
reviewed sealed bytes as the existing unprivileged host user through persistent
systemd units; only development builds use the isolated Docker execution profile.
