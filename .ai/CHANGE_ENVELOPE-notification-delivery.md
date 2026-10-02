# Durable notification copies

Goal: Persist SMS, email and browser-push delivery work with each new inbox event, then retry provider failures through the existing job queue.
Owner: `notifications` owns inbox events and channel dispatch; `operations` owns the existing durable queue; channel modules own provider gates and sends.
Risk: R3 (delivery lifecycle and provider calls; no new schema).

Inputs / outputs: One validated inbox event produces one durable job per external channel in the same database transaction; each job records DONE or FAILED/retry in the existing queue.
Invariants: Inbox dedupe stays owner-safe; muted/disabled channels are skipped at delivery time; settlement does not wait for providers; no remote calls occur in the transaction.
Allowed scope: Inbox dispatch, existing queue handler, provider result contracts, focused tests and connected PostgreSQL verification.
Forbidden drift: Provider configuration, preference storage, notification UI, new job table or synchronous payment delivery.
Failure / race cases: Concurrent duplicate event, crash before transaction commit, transient provider failure, retry after worker crash, missing user/event.
Proof required: Focused duplicate/failure tests, local connected queue check, type/source/architecture/security checks, PostgreSQL build and full project check.
