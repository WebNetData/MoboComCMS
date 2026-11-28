# Operations controls

The Store and Forms supervisors configure three deadlines independently. The
queue evaluates paid work by assignee, unanswered customer message and delivery.
The canonical expert ticket workflow records customer waiting intervals without
changing order or payment state.

Pay staff can distinguish a recent valid bank SMS, a rejected message,
an unready source, and a suspected gap when receipts are waiting without
recent traffic. The affected-payment link uses the source bindings fixed
when the payment quote was issued. Silence alone leaves the connection
status unknown. Receipt approval remains in the original payment workflow.

The Pay report records a period snapshot with an assigned reviewer.
That reviewer records the discrepancy outcome and closes the period after
the final day. A changed report requires a fresh review before closing.
Corrections create an immutable revision with an explanation.

The Cloud administrator filters renewals by date and invoice status, previews
the selected recipients and explicitly confirms a batch. Dispatch rechecks
the service term, owner and invoice. The canonical notification inbox and queue
show the recorded result and available delivery outcomes.

The PostgreSQL checks cover deadline transitions, SMS source and receipt
matching, reviewer authorization and immutable versions, and reminder retry
and deduplication. The additive migration is
`20270418170000_pay_financial_period`.

Connected checks passed for `expert-order-ticket`, `support-ticket-claim`,
`automation-event-recovery`, `pay-bale-collection`, `pay-financial-period`,
`cloud-workspace` and `hosting-renewal`. TypeScript, source, architecture,
schema parity and release manifest checks passed. Edge opened the supervisor
queue, SMS monitor, period review and Cloud reminder preview against an
isolated fixture database. The period review test also exercised closing,
correction and historical snapshot retrieval.
The Cloud fixture also exercised confirmation and the resulting queue
status. External notification delivery was outside local verification.
