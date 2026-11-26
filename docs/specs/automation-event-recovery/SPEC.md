# Recovery of general Automation events

When the scheduler claims an AutomationEvent today, it sets `processedAt`
before evaluating the rule or running its actions. If the process exits
after that write, the event is gone from the queue. A simple retry also
creates a second delivery risk where a provider accepted a request before
the response arrived.

Automation remains the owner of general rule dispatch. Keep the current
scheduler, trigger checks, permission keys, cooldown and scheduled scans.
Existing CRM engagement dedupe receipts share the table and must stay
outside the generic dispatcher and retention changes.

- Claim a pending general event temporarily. Require the current claim on
  renewal, first-action authorization and completion. A worker that lost
  its claim cannot start another action or mark the event complete.
- Resume work automatically if the claim expires before any action was
  authorized. If an action may have been attempted, retain a needs-review
  record. Do not automatically resend SMS, email or webhooks and do not
  automatically replay coupons or other writes. Known action outcomes
  remain in AutomationRun with their existing semantics.
- Acknowledge completion only after eligible rules have returned. Back off
  briefly on infrastructure errors before effects. Surface uncertain
  outcomes on the existing Automation Admin GET. Return the count and the
  latest 20 event IDs, types, review dates and reason codes. Keep the
  existing `automation.manage` guard. Omit private payloads and provider responses.
- Old processed rows and CRM receipts keep their existing meaning. A
  deployment has to move scheduler workers together. Avoid mixing old
  workers that understand only `processedAt` with new leased workers.
  Rollback with workers paused. Reconcile uncertain records before restarting
  an older scheduler.

Acceptance on an isolated PostgreSQL database: two workers compete for one
event, a pre-action crash recovers, a possibly-started action is quarantined,
an expired token cannot finish or start a later action, completed events do
not replay, and CRM receipts are preserved and never claimed. Provider
acceptance is represented by a test boundary. This slice does not promise
producer transaction capture or exactly-once external delivery.

## Admin review list

Render the existing private recovery projection in `/admin/automation` after
the execution summary. Show total and recent records with localized trigger
and reason, timestamp and reference ID. Keep the panel read-only. Exercise a
real PostgreSQL review fixture in desktop/mobile light/dark, and verify the
private payload and the worker's internal reason code are not rendered.
