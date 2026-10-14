# Invoice desk, recurring invoices and invoices that close by themselves (2026-10-14)

Decision: `docs/agent/PLATFORM_DECISIONS.md` §6M (bullets of 2026-10-14). Builds on the invoice subject of PR #180.

## Outcome
- Staff see every customer's invoices at `/admin/invoices`, open one in a side panel, change its title, description, discount, tax, due date and closing time, record a payment, void, refund (paid) or delete (unpaid), and make a new one: a one-off line, a plan or a product, or a **recurring** invoice (weekly, monthly, every 3, 6 or 12 months).
- An invoice whose price followed an exchange rate (a typed foreign amount, a product priced by the rate, a form's foreign amount) holds for **2 hours** and closes earlier if the rate of its currency **rises 3,000 toman** or more; the customer sees this on the invoice with a countdown, and is told when it closes and why. Staff may also close any unpaid invoice a number of hours after its due date.

## Actors & authorization
`invoices.manage` for everything on the desk (`/api/admin/invoices`, `/api/admin/invoices/automation`). Customers only see their own invoices. Every write is audited.

## Data
`Invoice.title`, `detail`, `expiresAt`, `fxRates` (toman per unit at checkout, JSON), `closedReason` (`FX_RATE` | `EXPIRED` | `OVERDUE`), `recurringId`; `RecurringInvoice`. Migration `20270101120000_invoice_desk`. Rules in the setting `billing.invoice-rules.v1` (`fxHours` 2, `fxJumpToman` 3000, `fxAction` delete, `overdueEnabled` false, `overdueHours` 72, `overdueAction` void).

## Paths and invariants
- Checkout stamps `fxRates` and `expiresAt` once (a replayed checkout returns the same invoice and never moves the deadline).
- The `invoice-rules` job runs each minute: expired → close; rate rose ≥ threshold → close; overdue (when on) → close; recurring due → issue.
- Closing claims the invoice as a hand void does (`voidOpenInvoice`): wallet credit goes back, the order is cancelled and its stock released; "delete" then removes the void record. A late Mellat payment for a closed invoice is reversed by the gateway route (money back to the card).
- **An invoice with a transfer receipt waiting for staff is never closed by a rule.**
- A fall in the rate never closes an invoice; an unknown rate never closes one.
- A recurring schedule is claimed by moving its date (`nextAt`) — one invoice per period even with two servers. Months are **Persian months in Tehran time**: 22 Mehr → 22 Aban; 31 Shahrivar → 30 Mehr; 30 Bahman → 29 Esfand.
- Paid and refunded invoices are kept for accounting (no delete, no repricing).

## Acceptance
- Unit: `scripts/invoice-rules.test.cjs`, `scripts/invoice-subject.test.cjs` (`npm run test:billing`).
- Browser with the real scheduler: `.mobocom/claude-tools/pw-invoice-desk.cjs` — desk, create from the page, edit in the panel, monthly invoice issued by the job and announced, "issue now", a foreign-payment form invoice stamped with the USD rate and a 2-hour deadline, the banner, a 3,500-toman rise closing and deleting it, a waiting receipt keeping another open, expiry and overdue closing (void, reason kept), the closed banner, phone width, 403 for an operator.

## Not built
Reminders before a recurring invoice; charging a saved card or the wallet automatically; prorating; recurring invoices for plans and products (one-off only).
