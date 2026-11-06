# Optional direct execution for one explicit request — 2026-11-06

Owner now requests occasional actions without individual proposal approval and
selects **«برای همین درخواست، با انتخاب خودم»**. This supersedes only the absolute
approval requirement in the first slice; normal requests still require review.

R3 extension of AI operations; no new scheduler, jobs, provider or owner command.
Settings manager enables direct execution per allowed tool (default empty).
Current requesting UserId must also hold each existing section permission.
Explicit literal direct:true + run-direct + UUIDv4 are required; model data or
normal propose requests cannot grant this mode. The checkbox resets on submit.
All plans are validated before storage/execution; only direct-enabled schemas
reach the planner. Existing owner rules, module gates, snapshots and strict audit
still hold. Pending review proposals cannot be upgraded to direct execution.

Persist executionMode and nullable unique requestKey on proposal history, using
the same requester/request UUID/action position for replay. Same key with changed
instruction is rejected. Concurrent repeats can plan twice but only one batch
persists and each action commits once. Each independent action retains its own
atomic claim/write/receipt/audit; stop at first error, show committed count and
remaining proposals for review. A network failure is ambiguous: refresh history
first; a repeated explicit request with the same key never regenerates its args.
No background retry. Replayed pending actions recheck current direct policy,
permissions, expiry and source version. Old proposals default REVIEW and remain
intact. No financial/refund/customer-message/new-domain authority is introduced.

Additive migration; preserve existing migration SQL/seals and records. Acceptance:
connected PostgreSQL default denial, explicit opt-in, disabled tools, current
permissions/policy change, once-only concurrency/replay, key mismatch, stale
source, audit rollback, partial progress and manual compatibility; real browser
toggle reset/default, policy save/reload, result/history and themed mobile/a11y.
Run scoped changed checks, not the full release stack. Rollback disables direct
policy and keeps mode/keys/history; never drop applied content or money rows.
