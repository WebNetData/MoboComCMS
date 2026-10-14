# Form builder — paid forms, staff work, more fields and looks

The owner asked for a Gravity-Forms-class builder that any part of the site can use: order forms where the visitor types an amount and details, the system prices it through the rate API, the visitor pays and a member of staff takes the work — and equally interviews, appointments, résumés.

## Audit (what exists)

`src/modules/forms` already is a form builder: 15 kinds of field, show-if conditions, steps, attachments, schedule and limits, notifications and auto-reply, spam rules, an inbox with triage statuses, CSV export, ready-made forms; a form is embedded by the page builder's `form` block, by a page's `formSlug`, and by the landing sections. It had no money, no work stages, no secrets, one look, and its admin page was squeezed by a class name shared with the forum. **Decision: extend this module; nothing parallel.**

## Slice 1 — built

- **Fields.** `time`, `slider`, `hidden` (a value the form stores, never the sender's), `secret`, `mobile` (Iranian), `national` (check digit), and three for money: `price` (a fixed cost), `fxamount` (a typed foreign amount with allowed currencies, limits, a percentage and a fixed profit), `total` (shows the bill). Options of `select` / `radio` / `checkboxes` may carry prices.
- **The bill** (`priceLines`, pure): one line per fixed cost, per chosen priced option and per foreign amount, for the fields that are shown. The foreign amount is converted by `quoteForeignAmount` (the rate source of `/admin/fx`) — on the page (`POST /api/forms/<slug>/quote`), on submit, and again at checkout.
- **Payment.** `settings.payment.enabled` (forces sign-in; needs a priced field). Submit stores the answer `UNPAID`; the site checkout takes `formSubmissionId` (order `meta.kind = 'form'`, an invoice, every gateway and the wallet, no discount code); the `FORM_PAID` fulfilment job marks it `PAID` once and opens it for staff. Only the sender can pay their own answer; it cannot be paid twice.
- **Work.** `stage`: `OPEN → IN_PROGRESS → DONE | REJECTED`, an assignee ("I'll do it"), a reply to the sender. Unpaid answers cannot be worked on. Unpaid forms open as `OPEN` at once. The sender follows it under **«درخواست‌های من»** (`/dashboard/requests`) and is told in the inbox.
- **Secrets.** Stored encrypted apart from the readable answers (`FormSubmission.secrets`); masked everywhere; revealed to staff by an audited action (`forms.secrets_reveal`); erased by staff, or by themselves seven days after the work ended or a bill went unpaid.
- **Looks.** Per form: theme (`classic`, `card`, `glass`, `minimal`, `bold`), accent colour, corners, density, width, and how steps show (numbers, bar, dots). Choices render as cards.
- **Permission.** Building forms stays `cms.pages`. `forms.handle` (new) reads answers, works on them and reads secrets; deleting answers stays with `cms.pages`.
- **Ready-made.** "Pay a foreign site" and "Appointment" join the templates.
- **Data.** Migration `20261228120000_form_payment_workflow` (additive columns on `FormSubmission`, CHECK rules for amount, pay status and stage).

## Next slices (not built)

1. Jalali date picker, appointment slots with capacity, name/address groups, repeating rows, signature, more attachment types.
2. Merge tags in notifications and confirmations, conditional notifications and confirmations, routing by answer, webhooks.
3. Save and continue, partial answers, entry editing by staff, per-field analytics and funnel, quizzes and scoring.
4. A drag canvas with columns, and a conversational (one question at a time) layout.
5. `forms.handle` scoped per form; assigning to a named member of staff; SLA and reminders.

## Acceptance

Unit: `scripts/forms.test.cjs` (17). Browser, local preview, 38 checks: building from the template with a priced option and a theme; a paid form without a priced field refused; the quote (rate + 5% + 150,000 + option); under-minimum not priced; sign-in required; the themed page, the live bill, the two steps, the payment step; the request unpaid in the sender's list with the password masked; work refused before payment; nobody else can pay; discount code refused; checkout → card-to-card receipt → approval → paid and open; not payable twice; the desk (bill, hidden password, reveal, take, done, reply, erase); the sender's page and inbox; an unpaid form with national id, time, slider and hidden value from a guest; the builder palette, inspector and settings.

Not run: a production build's page payload (Next's development mode sends server debug values, so the page source there is not evidence either way — the public filter is covered by a unit test); the seven-day erasure against a database; gateways other than card-to-card; the e-mail notifications of a paid form.
