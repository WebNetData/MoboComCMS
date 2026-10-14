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

## Slice 2 — built

- **Fields.** `jdate` (a Persian calendar; the answer stays the Gregorian day), `slot` (an appointment: open week days, hours, length of a turn, **capacity**, how far ahead — Tehran time), `repeater` (rows with the same columns), `signature` (drawn, kept as a private attachment).
- **Capacity.** `FormBooking` has a unique key on (form, field, turn, seat). The seat is taken inside the answer's own transaction; a seat taken at the same moment fails that transaction and the answer is tried again, so a turn is never overbooked. Rejecting or deleting an answer frees its turn. `GET /api/forms/<slug>/slots` lists open days and the turns of a day with the seats left.
- **Messages.** Merge tags (`{field:id}`, `{all_fields}`, `{form_title}`, `{entry_id}`, `{total}`, `{score}`, `{user}`, `{date}`) in confirmations and notifications. **Conditional confirmations** (the first whose conditions hold) and **conditional e-mail notifications** with recipients as addresses or `{field:<an e-mail field>}` — routing by answer. For a paid form they go out once it is paid.
- **Webhooks.** Up to three per form, for `submitted`, `paid` and `stage`: https only, a public address (private ranges refused after DNS), no redirects, six seconds, signed with HMAC-SHA256 when a secret is set. Passwords are never in the payload. One attempt; the result is logged.
- **Quiz.** Points on options (never sent to visitors), a pass mark, the score stored on the answer and shown to the sender.
- **Drafts.** With `saveDraft`, the browser keeps what was typed (never passwords, files, signatures or turns) and offers it back.
- **Layout.** Five widths on a twelve-column grid; the builder canvas shows fields at their widths. A **conversational** layout shows one question at a time (a heading stays with the question after it), Enter moves on.
- **Staff.** Per-field statistics; corrections of plain answers (audited; money, turns, passwords and files stay as sent); handing the work to a named member of staff (told in their inbox); **a form may name its handlers**, and then only they and the builders see and work on its answers.
- **Data.** Migration `20261229120000_form_bookings_quiz` (`FormBooking`, `FormSubmission.score` / `scoreMax`).

## Still not built

Name and address groups; attachment kinds beyond PDF and images; a resume link that works across devices (drafts live in one browser); retries and a delivery log for webhooks; resizing by dragging on the canvas; reminders and deadlines for staff; a funnel of where visitors stop.

## Acceptance

Unit: `scripts/forms.test.cjs` (21). Slice 2 in a browser, 38 checks: saving the advanced form; a non-https webhook and a recipient that is not an address refused; open days and turns; a turn outside the rule refused; booking with the conditional message and its tags; the quiz result; the same turn refused a second time and shown full; statistics; corrections (and their refusals); assignment (and to a non-member refused); a rejected answer freeing its turn; the page — widths, the Persian calendar, the turn picker, rows, a drawn signature, the draft after a reload, the result card; the conversational layout; the builder canvas, inspector, settings and desk. Not run for slice 2: an outgoing webhook and an outgoing notification e-mail (no receiver in the preview), two people booking the last seat at the same instant (the unique key is asserted, not raced), and a member of staff who holds only `forms.handle` (the local admin holds everything; the rule is unit-tested). Browser, local preview, 38 checks: building from the template with a priced option and a theme; a paid form without a priced field refused; the quote (rate + 5% + 150,000 + option); under-minimum not priced; sign-in required; the themed page, the live bill, the two steps, the payment step; the request unpaid in the sender's list with the password masked; work refused before payment; nobody else can pay; discount code refused; checkout → card-to-card receipt → approval → paid and open; not payable twice; the desk (bill, hidden password, reveal, take, done, reply, erase); the sender's page and inbox; an unpaid form with national id, time, slider and hidden value from a guest; the builder palette, inspector and settings.

Not run: a production build's page payload (Next's development mode sends server debug values, so the page source there is not evidence either way — the public filter is covered by a unit test); the seven-day erasure against a database; gateways other than card-to-card; the e-mail notifications of a paid form.
