# Direct AI execution for one request — 2026-11-06

Owner selects «برای همین درخواست، با انتخاب خودم». Branch
`feat/ai-direct-request-2026-11-06` from merged PR364/main1146e712. This changes
the earlier approval-only decision only for explicit direct requests; review
stays the default. [Spec](../../specs/ai-operations/DIRECT.md),
[Persian guide](../../AI-OPERATIONS-FA.md), [base owners](AI_OPERATIONS.md).

## Contracts and limits

Same AI module/purpose, private requester, canonical section permissions,
Settings CAS, strict Audit and six owner commands. No new provider, dependency,
permission resolver, queue, scheduling or automatic retry. Tools still exclude
payment/refund/cancel/restock/customer messages/arbitrary code and other domains.

`ai.operations.v1.directAllowed` defaults empty, including legacy saved policy.
It must be a subset of allowed tools. Only settings.manage configures it; that
does not grant tool permissions. Old full-save clients lacking this field turn
direct grants off conservatively. Invalid stored policy fails closed.
`operationsView` exposes only currently permitted direct tool IDs.

POST run-direct requires literal direct:true and UUIDv4 requestId. Host filters
model schemas to current direct grants, validates/preflights all actions and
stores the immutable batch before using existing owner commands. Model output
never selects execution mode or grants authority. Transaction-time policy,
module, section permission, owner, expiry and source-version checks remain.
Normal propose ignores direct flags and always requires individual review.
An existing REVIEW proposal cannot be executed through the direct helper.

Additive migration `20270221120000_ai_direct_requests`: nullable unique requestKey
and executionMode with REVIEW default/check constraint, both schemas/manifest.
Keys bind requester+UUID+position; concurrent planning may consume the model
twice but only one immutable batch persists. Repeated identical request IDs do
not regenerate args or repeat committed actions; changed instructions conflict.
Each independent action still commits claim/write/result/strict audit atomically.
First failure stops the loop; response reports applied/total and remaining
proposals stay reviewable. Successful earlier actions remain applied.

UI resets direct checkbox on submit, uses a stable in-memory request key across
ambiguous network errors and offers a read-only history refresh. Reloading the
whole browser or changing text starts a new instruction/key: operator must
review history before resubmitting. This is not durable client-side drafting.
Automatic replay of a remaining action rechecks current direct policy; explicit
manual review may approve it if ordinary tool authority still exists.
Audit metadata and the history badge distinguish direct from manual execution.

## Executed evidence

Ignored `.mobocom/ai-direct/`; isolated non-root Node22, native PostgreSQL and
synthetic accounts/recorded provider responses. No real account/model/customer
or production data used.

- 72 focused AI/Identity unit tests passed, zero skipped. Added default/legacy
  direct-off, subset/dedup and malformed-policy cases.
- Connected `ai-operations` passed: previous canonical owner/manual scenarios
  plus explicit consent/default denial, per-tool/section grants, concurrent
  direct execution/replay, changed-instruction key conflict, REVIEW isolation,
  partial progress, revoked direct policy and strict apply-audit rollback.
- Empty173 migrations passed. Separate empty172 baseline, seed existing proposal,
  additive173 upgrade preserved all original fields and owner/status/arguments;
  new fields are REVIEW/null. The initial harness reused a SELECT* prepared
  result across DDL and failed with PostgreSQL cached-plan type change; reconnect
  fixed the harness. Product source was unchanged.
- Types, architecture, source (2504 TS/TSX), security invariants, schema parity/
  money constraints and release manifest passed; no baseline/check weakened.
- Real browser: default review/direct disabled, per-tool policy save/reload,
  direct execution and immediate checkbox reset, once-only replay, normal request
  with forged direct flag still only proposes, disallowed tool denial, section
  manager execution/settings denial, guest/Origin and direct policy revocation.
  Four1440/390 light/dark captures, axe0/no overflow/no page errors; desktop-light
  and mobile-dark captures visually inspected.
- Two isolated PostgreSQL mutants detected: upgrading REVIEW through the direct
  helper and dropping persisted request keys. Application source unchanged and
  all extra databases dropped.
- React Doctor:0 errors,2 reviewed bounded branching warnings on the existing
  OperationalAssistant/ProposalCard; no suppression or dependency change.
- Final scoped Semgrep and redacted Gitleaks passed with zero findings. Semgrep
  initially could not start because the host paging file was exhausted; after
  stopping only the task preview the same unchanged source scanned successfully.
  Local Graphify refreshed incrementally/code-only with zero semantic tokens;
  graph relationships are static source evidence, not runtime authority proof.

No full build/release stack, hosted workflow, live-provider quality or production
deployment claim. Existing base evidence is retained, not claimed newly rerun.

## Adoption and rollback

Owner merges/deploys. Include migration and regenerate Prisma Client; leave direct
grants off until explicitly configured. Disable direct grants/AI before code
rollback; preserve additive fields and proposal/Audit history. Reverting never
undoes real content/order actions or silently replays past requests.
