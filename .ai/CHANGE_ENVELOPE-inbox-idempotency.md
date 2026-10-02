# Change Envelope: Inbox Delivery Idempotency

Goal: Dispatch SMS, email and push copies only for the request that created a durable inbox event.
Owner: Existing `notifications` inbox service.
Risk: R3, concurrent durable event writes and external delivery.

Inputs / outputs:
- Input: user event with globally unique dedupe key.
- Output: one inbox row and one best-effort dispatch attempt per channel.

Invariants:
- Existing callers keep the same return type and dedupe key contract.
- A duplicate key for a different user is rejected, never returned as that user's event.
- Delivery failures do not undo the durable inbox row.

Allowed scope:
- Inbox creation path and focused concurrent regression test.

Forbidden drift:
- No new queue or claim that external delivery is durable or retryable.

Failure / race cases:
- Concurrent creates race on the database unique constraint; one wins and the rest read its row without dispatching.

Proof required:
- Concurrency test, type/source/architecture/security checks and PostgreSQL build.
