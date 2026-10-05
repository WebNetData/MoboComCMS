# An invoice is paid or void, never both

## Audit

An invoice can carry wallet credit the customer reserved at checkout. When its payment expires, fails, or staff void or delete it, that credit is given back (`releaseInvoiceCredit`). When a payment arrives it is settled (`markInvoicePaid`). The two paths did not exclude each other.

1. **A settlement that lost the invoice reported it as paid.** `markInvoicePaid` reads the invoice, then claims it with a conditional update. When the claim found the invoice no longer open, it answered `ok, alreadyPaid` whatever had happened. If the invoice had been voided in that gap, the callers went on as for a paid invoice: the order's fulfillment was queued, or a wallet top-up credited, for an invoice that was void and whose reserved credit had been returned. Reproduced on `main` with the connected script.
2. **Closing an invoice released the credit before closing it.** Every caller gave the credit back first and marked the invoice void afterwards, two of them with an unconditional write. Between the two steps the invoice was still open with its credit already returned, and an unconditional "void" could overwrite a payment that had settled meanwhile. Staff deleting an invoice checked "not paid" on an earlier read and then deleted it and its order.
3. **A credit that failed to be released was not looked for again.**

## Behavior

- `markInvoicePaid` answers `alreadyPaid` only when the invoice really is paid. Losing the claim to anything else is a failure with the invoice's state in the message, as it already was when the invoice was found void before the claim.
- `voidOpenInvoice` closes an invoice: it claims it first (`UNPAID` or `DRAFT` to `VOID`, the same states settlement claims) and only then releases the credit. An invoice is therefore either paid, keeping its credit, or void, with its credit returned. The payment-expiry paths (FrenzyEx reconciliation, Plisio callback) and staff void and delete use it. A void that does not win the claim does nothing; staff are told to reload.
- Staff delete closes the invoice first, refuses when the credit could not be given back (so its record is not deleted with the invoice), and deletes only an invoice that is still void.
- The order worker gives back the credit of void invoices that still record one after ten minutes (`recoverVoidInvoiceCredit`); the release is keyed by the invoice, so it happens once.

A payment that arrives for a void invoice is refused, as before; the provider event stays recorded as failed for staff to resolve.

No schema change. The settlement result only changes in the case that used to be wrong.

## Owner

`billing` owns invoices, settlement and voiding; the recovery runs in the existing order worker.

## Acceptance

Real PostgreSQL on two connections with the real wallet: a settlement held between its read and its claim while the invoice is voided is not a success and writes no payment; the same with the full expiry path in the gap ends void with the credit back and the settlement refused; void then payment; payment then void; a repeated callback; six free races each ending in exactly one of the two outcomes; a failed credit release counted, then given back once; a young void left. Faults 1 and 2's consequence shown on `main` (`INVOICE_VOID_BASELINE`). Worker step test, full site tests, TypeScript, architecture, source, security and money checks, production build.

## Not in this slice

The checkout path that voids an invoice when the gateway refuses to create a payment is unchanged: no payment can exist for that invoice. Invoices already left in a wrong state before this change are not detected.
