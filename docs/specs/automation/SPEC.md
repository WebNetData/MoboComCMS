# Automation — "when this happens, if these hold, do these"

Owner decision: `docs/agent/PLATFORM_DECISIONS.md` §6R. Handoff: `docs/agent/handoffs/FORMS_AND_OPERATIONS.md` (Automation).

## Outcome

The site does routine work by itself: welcomes, reminders, marketing codes, handing out requests, alerts for work left waiting, closing finished tickets, daily and weekly figures. An admin builds a rule in three steps — **when** (a trigger), **if** (optional conditions), **then** (up to eight actions) — or starts from a ready-made rule, tries it without running it, and reads what each run did.

## Actors & authorization

- `automation.manage` (core permission, in `CORE_ADDED_LATER` so legacy full-access roles keep their extensions) — read, build, switch off, delete and try rules; read runs. Every write is audited.
- Nobody else. Operators with `forms.handle` or `tickets.handle` get 403 on `/api/admin/automation`.
- The engine acts as the system: it may hand a request to a member of the form's staff (the forms owner's `workOnSubmission(…, manager = true)`), and writes ticket messages as the first full administrator.

## Triggers (`src/modules/automation/domain/automation.ts` → `TRIGGERS`)

| Kind | Triggers | How it starts |
| --- | --- | --- |
| event | `user.registered`, `order.paid`, `form.submitted`, `form.paid`, `ticket.opened` | The owner of the event calls `emitAutomation(name, subjectKey, userId, facts)`; it is queued only while an enabled rule listens, and never throws into the caller |
| scan | `user.inactive` (days), `cart.abandoned` (hours), `subscription.expiring` (days), `stock.low`, `form.waiting` (hours), `ticket.waiting` (hours), `ticket.answered_idle` (hours) | Each minute the engine looks for subjects past the rule's wait |
| schedule | `report.daily`, `report.weekly` (hour, Tehran time; weekly on Saturday) | Once per day or week, with the period's figures |

## Actions (`ACTIONS`)

Inbox message to the user; e-mail to the user; SMS to the user (only a verified number whose owner agreed to messages, and within the SMS ceiling); a personal one-use discount code (1–90 %, 1–365 days, the message must place `{code}`); inbox message to managers, the form's staff or support; e-mail to one address; SMS to the admin numbers; give a request to the least busy member of the form's staff; change a request's stage (through the forms owner); close a ticket with a message; open a ticket to the user; a signed https webhook to a public address.

An action that does not fit its trigger is refused when the rule is saved (for example a user message on `stock.low`, a request hand-out on a ticket).

## Happy path

1. A customer submits form X. `form.submitted` is queued with `form:<id>` and the answer's facts.
2. Within a minute the scheduler's `automation` job claims the event (one server only), finds enabled `form.submitted` rules **made before the event**, checks their conditions and runs their actions in order.
3. A run is written per rule and subject (`DONE`, `PARTIAL` or `FAILED`, with one line per action) and the rule's count goes up.

## Edge paths and invariants

- A rule never answers an event older than itself.
- One run per event; a scan runs once per subject (a waiting ticket's subject includes the time of the customer's last message, so a new wait is a new subject); a cooldown in hours allows repeats.
- A failing action is written down and the rest of the rule and the other rules go on.
- `{tag}` in a message is filled from the event's own facts only; an unknown tag becomes empty.
- Links in messages are site paths (`/…`, not `//…`). Webhooks: https, no credentials in the address, private addresses refused after DNS, no redirects, 6 s timeout, one try.
- Events are kept two weeks after processing, runs half a year.

## Admin controls

`/admin/automation` (menu: Users & support → Automation): figures, ready-made rules, the three-step builder with "try it" (how many subjects it would find now, a sample), the rules with an on/off switch, and the latest runs (a rule's own runs on request).

## Contracts

`GET /api/admin/automation` → `{ rules, runs, triggers, actions, recipes }`; `?runs=<ruleId>` → that rule's runs. `POST` with a rule → saved rule; `{ op: 'toggle'|'delete', id }`; `{ op: 'preview', rule }` → `{ kind, found, sample, note }`. Errors are 400 with a Persian `error` for the person building the rule.

## Data

`AutomationRule`, `AutomationEvent`, `AutomationRun` (both schemas; migration `20261231120000_automation`). No existing table changes.

## Acceptance verification

- Unit: `scripts/automation.test.cjs` (refusals, conditions, tags, run-once, readable subjects, wiring).
- Browser, local: `.mobocom/claude-tools/pw-automation.cjs <A> <B>` — 17 checks with the real scheduler: refusals, 403 for an operator, a form submission running four actions (inbox, least-busy hand-out, a 7 % one-use code, staff message), a condition that does not hold, a waiting-ticket scan, no second run, report preview, the page and the builder.
- Deliberate breaks that must fail: dropping the `createdAt` comparison in `processAutomation` (a rule then runs on an older event — the browser test sees two runs); removing `automation.manage` from `CORE_ADDED_LATER`.
