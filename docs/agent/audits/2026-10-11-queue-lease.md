# Queue claim integrity — 2026-10-11

## Reproduced defect and existing-owner fix

Actual PostgreSQL baseline1791721135785-17260 reproduced an old suspended runner overwriting a newer recovered runner's completed result. `operations/server/queue.ts` now claims the selected attempt counter and fences success, failure/backoff and unknown-kind terminal writes with RUNNING status, exact lockedAt and incremented attempt. Failure logs require a successful conditional update. Terminal dedupe-key release also matches the inspected status/key; a concurrent retry retains the active job/key. No migration, new queue, URL, permission, money-state or protected React/CSS changes.

## Executed evidence

Root ignored `.mobocom/restrictions-<id>.log` contains isolated PostgreSQL/Redis, non-root Node22, no .env evidence; owned fixture cleanup runs in finally. No real provider or file-cache effects.

- Registered `queue-lease` runs two concurrent runner invocations against actual SQL, deliberately ages the held first lease past the existing ten-minute predicate, completes the recovered second runner, then releases the first with success and failure. Exact newer row stays unchanged. A third actual SQL interleave retries a FAILED row after enqueue's terminal read and before key release: enqueue returns that active row without stripping its key or creating another job. This is controlled lease aging, not a process-crash or eleven-minute elapsed-time test; handler boundary is doubled.
- Final four PG owners queue-lease, queue-jobs, notification-dedup-integrity and import-execution-authority native0:1791721742202-18296. Existing queue recovery/backoff/attempt-limit/unknown-kind/dedupe checks remain intact.
- Three source faults detected with actual assertion failures and restored: unfenced success1791721728535-32132, unfenced failure1791721729071-19436, unconditional dedupe release1791721729599-8972. Final PG batch ran after restoration.
- Narrow price-drop six tests native0:1791721336892-24308. Initial two unit failures1791721210072-32196 exposed mocks recording only the old unconditional update; existing mocks now record conditional updateMany. No assertion was removed.
- Full check log1791721430708-26196 reaches all final gates with638 tests (581+53+4), zero failures; build log1791721441006-40432 reaches generated82 pages and final route/bundle table, existing CSS warnings retained. Their initial wrapper return handles were lost across context compaction, so native exit codes for those two invocations are not claimed. Separate final TypeScript native0:1791721744562-24428; actual compiled production-server browser native0 supplies independent build-artifact evidence.
- Compiled HTTPS browser24 pass, zero fail/skip/retry,33.0s:1791721768826-16288. Actual compiled import queue/rollback consumers, old account/Global Admin/Telegram/checkout/settings/security/light-dark/mobile/a11y cases pass. Browser does not reproduce stale recovery; that is the connected SQL test above. Expected revoked-session logs and a successfully retried Settings serialization conflict are fixture scenarios, not live production outages.

## Boundaries and next work

This fences queue row ownership, not effects already performed by stale handlers, follow-up enqueue, exactly-once provider delivery or old-version workers. Quiesce unfenced old workers at rollout. Current operator authority for manual administrative maintenance and module-specific reconciliation remain PARTIAL; system projections and financial obligations must not be blanket-cancelled. Root app/client/:3000 and owner files preserved. No GitHub Actions/push/PR/merge/deploy; no token-saving measurement claimed. Goal remains active.
