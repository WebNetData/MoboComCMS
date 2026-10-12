# Notification deduplication integrity — 2026-10-11

Continuation in the canonical Notifications/Jobs owners from merged main
`8a3bc9f`, not a new inbox/outbox system or provider certification.

## Actual baseline and repair

Twenty-four concurrent identical `createInboxEvent` calls reproduced 23 native
duplicate-constraint errors. The existing transaction caught P2002 and returned
the original event; that replay contract and atomic three-channel queue are kept.

An existing event now returns immediately after its owner check. New/concurrent
events use targeted parameterized conflict insertion, a typed ORM read and the
three canonical delivery jobs in one database batch. Concurrent producers keep
the original row and job states; a different owner's key never queues delivery.
Unexpected storage errors propagate and roll back the complete event/queue.
Historical replay never recreates deleted jobs. No schema, provider, notification
preferences, transport contracts, permissions or visual design changed.

## Executed evidence

- `node scripts/run-pg-checks.cjs notification-dedup-integrity analytics-integrity notification-policy journal-comment-notifications`:
  all four passed against real owned PostgreSQL fixtures without `.env`, uid1000.
- The notification connected check also passed on the isolated SQLite schema/client.
  Both databases proved 24 concurrent producers, one event/three correct channel
  payloads, zero ordinary native constraint errors, immutable text/read timestamps
  and completed jobs, historical replay without requeue, URL rejection and real
  NOT NULL queue failure with whole-event rollback and successful retry.
- A second cross-owner case held both real initial reads before the writes,
  proving exactly one successful owner and one refusal inside the concurrent
  batch. Both databases passed this case, not just the existing-row fast path.
- `node --test scripts/engagement.test.cjs scripts/inbox-idempotency.test.cjs`:
  13 passed. The existing inbox unit now covers owner-preserving replay and actual
  provider-result boundaries; database guarantees moved to the registered real
  connected test rather than a simulated transaction.
- Deliberately removed owner protection, historical fast replay and atomic batch:
  all three were detected after a connected green baseline; source bytes restored.
- `npm run check`: passed with both source slices, 581 site + 53 connected + four
  backup tests, including TypeScript/architecture/source/security gates.
- Final `npm run build:postgres`: passed, native exit 0
  (`1791677239920-19868`). Complete configured HTTPS/PostgreSQL browser suite:
  58 passed, seven existing fixture skips, zero failures/retries, 3.4 minutes
  (`1791677894154-28180`), including actual wallet/code/refund, scoped restrictions
  and magazine-only save. An initial incomplete runner had setup failures and is
  not counted as success; the existing fully configured runner passed.

Raw ignored local logs: red baseline `1791676789458-25664`, selected PG
`1791677060669-19616`, final cross-owner PG `1791677164147-32684`, SQLite
`1791677164139-32316`, units `1791677060662-28456`, deliberate probes
`1791677236712-41796`, full check `1791677096958-16436`.

No real customer message was sent and no hosted Actions/PR was run. Demo plans
still lack provider configuration; genuine configured delivery and deployment
evidence remain open. No token or throughput savings claim is made.
