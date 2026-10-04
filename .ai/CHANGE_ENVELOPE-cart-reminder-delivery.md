# Abandoned cart reminder delivery

Goal: Every due abandoned-cart reminder is sent once, regardless of how many other carts are waiting or failing.
Owner: `store` owns reminder eligibility, schedule and scheduler; `notifications` owns the deduplicated inbox write.
Risk: R3 (durable job and customer notification state).

Inputs / outputs:
- Signed-in carts with lines, recovery settings (steps, minimum value, maximum age), orders since the last change.
- One deduplicated `CART_REMINDER` inbox event per cart, step and cart revision; `reminderCount`/`remindedAt` and one `CartReminder` row after the event exists.

Invariants:
- Carts between two steps never hold back carts that are due (selection is per step, due carts only).
- One cart that fails (pricing, inbox) does not stop the run; it stays due and is retried.
- A step is consumed only after its inbox event is durable; claim and `CartReminder` row are one transaction.
- The claim matches the cart revision it read, so a customer change during the run is not overwritten.
- At most one reminder per cart per run, steps in order; the schedule stays measured from the customer's last change.

Allowed scope: `runCartRecovery` in the Store marketing server and focused verification.
Forbidden drift: Settings shape, Admin recovery screen, notification channels, cart pricing, schema.
Failure / race cases: more than 200 carts between steps; cart that cannot be priced; inbox write fails; two schedulers; customer edits the cart mid-run.
Proof required: Connected PostgreSQL reproduction at the previous revision and passing run, focused marketing tests, type/source/architecture/security checks, PostgreSQL build.
