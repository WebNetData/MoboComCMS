# Standard production and Chat DOM readiness — 2026-11-08

Branch fix/bulk-production-models-2026-11-08 from owner-merged release1.7.10/main
8600c429. Continue existing AI_PRODUCTION; schema, dependencies and published
migrations/releases are unchanged. Owner expressly requires the existing
mobocom-app: no container creation or app restart occurred. Scoped changed files
were synchronized into /app only after comparison with HEAD/previous synced bytes;
originals retained under /tmp/mobocom-ai-standard-backup for local rollback.

Existing AI batch/credential/routing owns independent text/image targets, explicit
API/resource consent and pinned destinations. Missing generation config stays Chat
web. Qwen and DeepSeek join the provider registry and existing AI egress purpose.
settings.manage is required for other configured pools and model overrides; section
staff only use their assigned production API/model. Authority is rechecked each
step. Standard API bypasses personal/Codex routing, uses existing credential health
and only explicit same-service rejection failover, never an implicit provider or
model switch. Claim commits before provider I/O; canonical completion and draft
save keep version/lease/idempotency/fresh actor/module/Origin fences. Image API is
explicit custom OpenAI-compatible bounded base64, never arbitrary returned URL
fetch. GPT Image omits unsupported response_format and requests medium WebP.
Native Qwen image protocol is not claimed. Root Xray builder adds only two exact
hosts; an installed root tool must be upgraded/reapplied by the operator separately.

Bridge0.3 shares textarea/contenteditable readiness, unique send selection, explicit
Chat switch, repeated fresh-tab/path guards, normalized DOM insertion verification
and one send. UI errors reveal/retain only the request's owned tab for manual login
or mode selection. No cookie export, authentication/CAPTCHA automation, private
inference endpoint or replay. New bulk capability check precedes persisted claim;
old editor/core consumers retain production-v1 compatibility. ZIP has9 source files.

Actually executed evidence in ignored .mobocom/ai-standard:
-77 initial affected AI/egress cases passed. The failing bridge fixture was updated
 to the shared script injection list and passed; the other failing shell fixture
 passed from normalized LF source (Windows bind line endings). Four API cases then
 passed; final five provider/image/consent cases and the new egress contract passed.
-Existing production and new API native checks ran as UID1000 on177 migrations in
 an owned test database inside the SAME app container. New native checks prove
 assigned model authority, duplicate at-most-one provider call, no browser result
 forgery/personal fallback/replay, Origin/section/owner/module/config denial, late
 stop, actual canonical DRAFT and Media registration, and destination-change denial.
 Empty and existing-AI-setting scenarios passed; three prior setting values were
 restored exactly. Installed app DB was used only for3 named browser fixture users.
-Actual unpacked extension:8 controlled DOM cases (legacy/modern/textarea/explicit
 Chat switch/text/image/Work/ambiguous/login) passed; a focused final3-case follow-up
 passed Chat switch, navigation to old-history denial and nested single-image
 deduplication. This is NOT a real ChatGPT account test. CUA's real browser/native
 host was unavailable; no live account compatibility claim.
-Actual Admin UI with controlled production API verifies consent/provider/model,
 API-only generate/review/save without bridge, saved batch reload and old-batch
 bridge0.3 preflight before start. Native API permission fixture initially returned
400 due too-short facts; corrected real section/customer403 passed without UI replay.
 Focused final UI proves API stop, quota error with no implicit retry/Chat fallback,
 readonly model controls, real authority metadata and image text-probe409. Four
1440/390 light/dark scoped axe0/no-overflow views passed; final styled screenshots
 were inspected. Browser UI relay and native API evidence are separate fixtures.
-Final scoped TypeScript23 files plus ambient declarations, permission inventory,
 architecture/source/security/audit/manifest/14-source knowledge gates passed.
 Full default tsc hit its2GB heap before the scoped3072MB check; no full local
 production build or release suite replay. Doctor0 errors/13 reviewed warnings.
 Scoped Semgrep and redacted Gitleaks0; Windows CertOpenSystemStore initially
 failed under sandbox, then the same local scan passed with read access. No
 scanner rules/baselines/certificate validation were weakened.

No real model/account quota, customer messages, host-root tool install, new
container, manual hosted dispatch, production release or VPS deploy. Current
app development changes remain; temporary resource cleanup and exact ZIP/source
proof are recorded in final receipts. Guide ../../AI-PRODUCTION-FA.md; scenario
../../specs/chat-web-production/STANDARD_MODELS.md.

Rollback: stop/cancel API batches and disable AI before using old core; old core
does not understand generation targets or Qwen/DeepSeek config IDs. Keep all batch,
content, media and settings backup data. Restoration of pre-upgrade AI settings
is an explicit operator action; never restore/reset the whole database silently.
