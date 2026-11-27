# Continuous customer engagement — 2026-11-07

## Opportunity quotations and paid conversion — 2026-11-27

Checkout `.mobocom/crm-opportunity-quotations`, branch
`feat/crm-opportunity-quotations-2026-11-27`, based on PR510 head `bbcf6906`.
[Scenario and contract](../../specs/crm-opportunities/QUOTATIONS.md).

An authorized opportunity holder or manager with `orders.manage` can
create a Store quotation for the same canonical customer. Existing
Store product, discount, expiry, stock and conversion logic still owns
the offer. CRM's bridge and strict audit commit in the Store creation
transaction. One active or converted quotation can occupy an opportunity;
expired or cancelled offers remain in history and can be replaced.

Explicit staff confirmation shares the existing quote in the customer's
in-site inbox. Repeated approval is idempotent, and no external channel
is selected. The panel shows effective expiry, share time and current
Store order state. The durable queue schedules internal reminders for
the current eligible opportunity assignee three days after sharing and
24 hours before expiry. A shorter offer uses only the expiry alert. The
worker rechecks both module switches, the quote, opportunity and assignee
before writing any notice. A converted, cancelled or expired offer
produces no subsequent reminder.

Reports apply the opportunity's existing customer/holder scope and
`orders.manage`. Conversion uses current PAID orders; the report compares
the estimated opportunity and actual order totals for the converted
cohort per currency. The paid order does not change the opportunity's stage.

In isolated PostgreSQL 17, the empty chain applied 229 migrations and a
populated upgrade preserved the prior standalone Store quotation and CRM
opportunity. The connected CRM quotation, CRM opportunities, follow-ups,
Store quotations and generic queue checks passed in Linux UID1000 without
an `.env`. The new check covers permissions, same-customer binding,
racing creation and sharing, decline of invalid discount precision, exact
pricing, replacement of an expired offer, internal delivery deduplication,
stale reminders and paid scope. TypeScript, source/import, architecture,
security, schema parity and release manifest checks passed.

Edge exercised physical-product selection, a Jalali expiry, exact discount,
explicit sharing, the order link, paid totals and Origin denial. The buyer
opened the canonical quotation from the authenticated dashboard inbox. Scoped axe
was clear at 1440 and 390 in both themes. React Doctor reported zero blocking
errors and nine advisory warnings across the inspected components.
Scoped Semgrep reported zero findings. The 27 Store and Livechat unit tests
passed without `DATABASE_URL`. With a PostgreSQL URL, the existing inventory
unit's fake transaction lacks `$queryRaw`; the same failure reproduced on
unmodified PR510 base. Real Store quotation conversion passed in PostgreSQL.

Deploy after the opportunity migration from PR510 and the new
`20270416120000_crm_opportunity_quotations` migration. Roll back application
code with the bridge intact and preserve the erasure hooks for retained
links. Older runtimes may classify pending reminder jobs as unknown.
The owner merges and deploys.

## Sales opportunities — 2026-11-27

Continue `.mobocom/crm-sales-pipeline`, branch
`feat/crm-sales-pipeline-2026-11-27`, from merged main `9d874d61`.
[Scenario and acceptance](../../specs/crm-opportunities/SPEC.md).

Livechat CRM owns opportunities, versioned stage changes and a
permission-scoped Persian board. The manager can view company-wide work
and assign eligible colleagues. Other CRM staff view their own
opportunities. A form answer or ticket can be converted once after the
actor's source access and ownership are checked. An anonymous form needs an
explicit existing customer. Source links return to the original record and
are resolved against current source permissions. CRM does not retain
copies of answers, tickets or login credentials.

The existing follow-up desk and queue own due dates and completion. The
assigned staff member receives an internal inbox reminder from 09:00
Tehran on the due date. The job rechecks authority, and closed or removed
work produces no notice. Reassigning an opportunity preserves prior
individual task assignments. Closing an opportunity atomically cancels
its open linked tasks. Reaching WON or LOST is final for this workflow.
Reports show stage counts, open work without a change for 14 days, closed
success rate, and estimated opportunity value by currency. They do not
post money or create orders.

PostgreSQL 17 ran in disposable Docker databases as a non-superuser with
Linux UID1000. The empty database applied 228 migrations. The populated
upgrade kept an existing follow-up, ticket and form response. Seven
registered connected suites passed, covering source guards and dedupe,
concurrent changes, history, reporting, internal-only reminder
deduplication, closure, erasure, and shared Forms/Support/queue behavior.
Forty-two scoped Forms and Livechat tests, TypeScript, architecture,
source/import and security invariants passed. Scoped Semgrep and redacted
Gitleaks reported zero findings. React Doctor reported no blocking
errors. It flagged complexity and asynchronous fetching in the new
components. The fetch effects discard aborted responses.

Edge exercised actual fixture-backed creation from the customer
profile, Jalali selection, conversion from a permitted ticket and an
anonymous form, navigation to the original response, linked follow-up
creation and navigation from its queue, stage history, closing and
permission/Origin denials. At 1440 and 390 in both themes the Persian
board and detail passed scoped axe with zero violations, no viewport
overflow or page errors. The stage, owner, and stale filters passed.

Apply additive migration `20270415120000_crm_opportunities` before
starting the new application. No backfill is needed. Roll back the app
with the data tables intact. Preserve the erasure entry points for
customer and staff rows. Jobs executing while Livechat is disabled skip
their reminder. An older runtime can mark queued reminders as unknown
jobs. Review the failed reminder jobs after restoring the feature. The
owner merges and deploys.

## My follow-ups — 2026-11-27

On `.mobocom/crm-workdesk`, `feat/crm-workdesk-2026-11-27` from merged
main `de55a51c`, the existing DailyWorkdesk shows the signed-in staff
member's overdue, today and upcoming CRM counts and up to five tasks.
The full queue at `/admin/crm/follow-ups` adds paged date filters,
customer-file links and existing version-checked completion. User
managers can choose a colleague, unassigned or all work. The server
rejects crafted cross-assignee scopes from other users. The disabled
module contributes no queue. Completed and erased-customer work is
excluded from queue counts. No new CRM data, permission keys or migration.

From a disposable 226-migration PostgreSQL 17 database with a non-superuser
owner and Linux UID1000, `crm-follow-up-queue`, `crm-follow-ups`,
`platform-workdesk` and `automation-event-recovery` passed. The queue
check verifies actual scope, date buckets, two-page ordering, module-off,
completion, conflict and the committed audit. TypeScript, source/import,
architecture, security and release manifest checks passed. React Doctor
reported zero blocking errors in the five inspected React files.

Edge used actual PostgreSQL and the canonical session for a support-only
staff member and full-access manager. In Persian RTL at 1440 and 390 with
light/dark, verified the dashboard entry, denied crafted scope, clearing
the denied filter, own queue, colleague and unassigned filtering, and
mobile completion followed by history on the customer profile. Scoped
axe, page errors and viewport overflow were clear. No live providers ran.
For rollback, revert the application slice. Existing tasks and audit history
are retained. Contacts, CRM deals/pipeline and automatic reminders are
separate product work.

## Customer follow-ups — 2026-11-27

Continue `.mobocom/crm-follow-ups`, `feat/crm-follow-ups-2026-11-27`,
from merged PR505/main `6ef4b061`. The existing Livechat CRM profile has a
linked follow-up panel with a Jalali day picker, responsible colleague,
overdue indication, and done/cancelled history. Existing CRM staff can
read and assign to themselves. The holder or a user manager can update
open work. Only user managers can assign to other eligible active staff.
Requests compare the same version and write the audit with the mutation.
No title is copied into audit metadata. Identity erasure removes customer
tasks and clears links to erased colleagues. There is no automatic send.

Disposable PostgreSQL 17 migrated 225 entries as NOSUPERUSER. The populated
224→225 rehearsal preserved the existing CRM note. Connected
`crm-follow-ups`, `crm-customer-desk`, and `crm-scope-currency` passed in
Linux/UID1000. The new test covered refused scopes and dates, handoff,
concurrent closure, audit privacy, and erasure. TypeScript, source/import,
architecture, schema parity and migration-manifest checks passed. React
Doctor reported zero errors and four advisory warnings across two files.

Edge exercised the real PostgreSQL-backed profile in 1440 and 390 at
light/dark, Persian/RTL. The manager selected a Jalali day, assigned and
edited a task, then the assignee closed it on mobile and saw it in history.
Guest/customer direct reads returned 403. Four scoped axe runs, page errors
and overflow were clear. No provider or production deployment ran.

Migration `20270412120000_crm_follow_ups` is additive and unreleased. For
rollback, revert application code and keep the migration/table and existing
task history. Keep the erasure hook if rolling back just the desk, or pause
account erasure on the older application until the hook is restored.
A cross-customer assigned-work queue remains a separate slice.

## Persian customer relationship desk — 2026-11-27

The owner asked for «مدیریت ارتباط با مشتریان» and a professional CRM
workspace after merging PR504. Continue `.mobocom/crm-customer-desk` on
`feat/crm-customer-desk-2026-11-27`, based on main `815c2374`.
[Scope and acceptance](../../specs/crm-customer-desk/SPEC.md).

The existing Livechat manifest owns the single menu entry under People.
The customer desk applies search, tag, account status and the canonical
purchase segment before stable 25-row pagination. The existing private API
adds page, sort, filtered counts and an engagement-link capability. Search
supports Persian numerals and Iranian mobile variants. Existing totals,
profile, notes and tags keep their owners. Staff and erased identities do
not appear in the desk. URL filters work with the existing saved-view
workspace. No schema, public URL, or marketing rule change.

Both `crm-customer-desk` and `crm-scope-currency` passed in Linux UID1000
on isolated PostgreSQL 17 after all 224 migrations. Evidence includes an
older customer behind 70 newer accounts, boundary dates, combined filters,
mixed IRR/IRT, and persisted department visibility. Removing the segment
predicate in an isolated copy failed the connected assertion; restoring it
passed. The desk check also
passed against a fresh disposable SQLite client/database. Livechat unit
tests 12/12, TypeScript, source/imports, architecture and generated extension
checks passed. React Doctor reported zero errors and 13 warnings in the
four touched React files, including two in the desk. The desk fetch aborts
superseded requests and checks its signal before updating state. Its
explicit table role retains semantics for responsive rows.

Real Edge against the isolated PostgreSQL-backed preview passed desktop
1440 and mobile390 in light and dark, with Persian RTL, no page errors or
overflow and no scoped axe violations. Click/keyboard proof covered
pagination, query reset, phone search, opening a profile and an empty result.
Guest and customer API refusals were 403. A Support-only session could list
customers but received 403 on engagement and saw no engagement shortcut.
Visual review caught a duplicate menu item and a paging link behind the
floating assistant. The final browser run verified both corrections.
No full production build or provider operation was tested.

Rollback the application slice as a unit. No data rollback is needed. The
next product slice can add owned follow-ups with a responsible staff member,
due date and history before extending into Leads, Deals and a sales pipeline.
General automation durability remains a separate execution slice.

Owner requested ongoing CRM relationships, followed-product/special offers, stock
return and birthday SMS. Implemented on `feat/crm-engagement-2026-11-07` from
main `d7d4a23a`, including owner-merged PR368 and independently of PR369.
Owner merges/deploys.
[Scenario](../../specs/crm-engagement/SPEC.md), [Persian guide](../../CRM-ENGAGEMENT-FA.md).
Status: functional within the bounded local evidence below; not whole CRM,
provider delivery/read/conversion or production rollout certification.

## Owners and behavior

- Existing Livechat CRM owns customers, tags, notes, purchase-based segments and
  timeline. Identity owns canonical UserId, custom profile date and affirmative
  consent. No second CRM contact/login identity or browsing tracker.
- `automation/domain/engagement*.ts` owns a closed, bounded configuration:
  birthday, product-interest, segment-offer and winback. Global default off;
  at most20 stable-id journeys. Tags use ANY within a tag list; segment, tag,
  date, product, purchase suppression and consent conditions combine with AND.
  Winback uses last recorded login, falling back to account creation; it does
  not claim continuous session presence measurement.
- `automation/server/engagement.ts` is the public facade; its folder separates
  settings/history, audience, serializable enqueue, resumable scan and preview.
  Product follow requires existing `ItemFavorite.notify`; current Store state,
  active/approved unrestricted stock and recent paid legacy/line purchases are
  checked. Existing Promotions/Checkout retain all price/coupon authority.
- Birthday reads only an explicitly selected enabled Identity date field.
  Input and anniversary calendars are independently explicit, Persian/Gregorian
  with Unicode digits, round-trip validation, future-date refusal and leap-day
  policy. A global per-member/calendar-year birthday dedupe spans duplicate
  journeys. Other keys retain journey/member/period identity across text edits;
  the last committed receipt also enforces the real cadence interval.
- Minimal already-processed AutomationEvent receipts, fresh serializable
  consent/audience/caps and canonical inbox plus selected
  channel jobs commit together. Retry Prisma serialization/uniqueness conflicts
  and PostgreSQL40001/40P01 exposed through parameterized SQL P2010; unrelated
  failures propagate. Daily and seven-calendar-day caps span new CRM journeys.
  Scan budget10–200 must cover active journeys; id cursors resume pages, with
  hourly catch-up after a completed scan and birthday priority.
- Notifications own durable inbox/per-channel jobs/retries. Optional transaction,
  channel/source/expiry metadata preserve old callers. Empty metadata retains
  legacy channel behavior; `'-'` means explicitly inbox-only. Public Automation
  delivery policy rechecks current consent, journey hash, date/audience/product,
  selected channels and same-Tehran-day expiry. Quiet-window deferral updates the
  claimed existing queue row without consuming provider retry attempts. Past-day
  external copies expire; no stale next-day marketing burst. Shared preferences
  also enforce current consent for direct CRM SMS/email/push consumers.
- Catalog's existing price-drop producer now uses `PRODUCT_PRICE_DROP`, with
  real SMS/email event definitions and existing follow-key dedupe. Old
  `FOLLOWED_UPDATE` channel mutes carry forward; queued price drops respect
  Store-off. Stock-return, cart recovery, loyalty and newsletter keep their
  existing owners, subscriptions and pressure policies, linked from this panel.

## Same-process contracts and presentation

`/api/admin/crm/engagement` uses canonical **users.manage AND automation.manage**:
GET returns settings/revision, bounded30-day overview and available date fields;
`?products=1&q=` returns at most30 unrestricted products. PUT `{settings}`
requires exact64-hex `If-Match`; POST `{settings,journeyId}` previews at most50
opted-in active customers, at most10 examples, without writes or sends. Preview
does not count the whole audience or guarantee channel/cap eligibility.
Same-Origin, bounded JSON, strict write limits, no-store and atomic audit/history
apply. Stale writes409 preserve local edits; missing revision428. History read
and restore compose the same combined permissions and existing Settings owner.

Existing `/api/inbox/preferences` GET adds optional `marketing` consent metadata;
PATCH `{marketingOptIn,expected}` claims only the current active member and audits
atomically. All preference writes require same-Origin. Old catalog/mute fields
and per-event/channel choices remain. No administrator opts customers in through
this panel; prior User rows default false. These are typed internal web contracts,
not a new public/mobile API, event broker or independent consumer requiring Pact.

Admin `/admin/crm/engagement` composes existing semantic MoboCom tokens: journey
list/edit, settings, bounded preview, real communication/channel history and
existing related tools. Save is explicit; creating/editing/previewing sends
nothing. Selected channels still depend on the provider configuration and member
choice. Existing CRM profile timeline includes communication references. Member
preferences add optional offers/birthday consent; transaction notices remain
independent. SMS accepted by a provider is never labeled read or converted.

## Executed local evidence

- Empty PostgreSQL applied176 migrations. Separately, populated174→176 upgrade
  retained synthetic profileData, CRM note and old notification; new consent
  defaults false/null and old delivery metadata remains empty/null. Legacy AutomationEvent payload and null dedupe survived as well.
  Real Prisma
  checks ran as UID1000 without `.env` or production data.
- Registered `crm-engagement.connected.cjs` passed real canonical permissions,
  Origin/history restore, explicit consent/current-user/stale/audit rollback,
  preview read-only, Settings CAS/audit rollback, concurrent shared caps,
  cross-journey birthday dedupe, real rolling cadence, current CRM tags/segments/
  login conditions, Store/private/follow/purchase gating, queued opt-out/pause/
  expiry, selected channels/mutes, verified phones, bounded scans and cursor
  catch-up. Real Queue/SMS/Mail owners with synthetic IPPanel/Nodemailer transports
  proved independent retry and no repeat SMS after email failure; queue failure rolled
  back receipt/inbox/jobs together. Erasing inbox notices did not reset once-only
  or pressure decisions; real engine cleanup kept minimal receipts and still
  removed ordinary expired events. Quiet-window
  deferral preserved attempts and invoked no marketing transport.
- Deliberately removing shared pressure, current consent or durable receipt retention in the owned runtime
  failed the native assertions. Exact files were restored and native acceptance
  passed. A final native run after formatting/restore coverage also passed.
- 63 focused domain/owner unit cases passed across Automation, Identity profile,
  Livechat CRM, SMS/Mail/newsletter, inbox/push, price-drop, stock and job isolation.
  Two affected old test loaders now use the common source loader; the price-drop
  expectation follows its new explicit kind. No assertions were removed to hide
  runtime failures. Existing native `notification-dedup-integrity`,
  `notification-policy`, `queue-lease` and `queue-jobs` passed.
- Actual Edge/Playwright: Admin draft save, selected SMS, opted-in followed-product
  preview with zero notices, global-off persistence, stale-save edit retention;
  loaded1440/390 light/dark forms without overflow. Mobile member opt-in,
  persisted reload, opt-out and other-account isolation; guest and automation-only
  direct denials; empty log and keyboard. A genuine inbox-only event appeared in
  Admin log and CRM customer timeline, and Settings history opened. Ten scoped
  axe runs had zero violations. The final durable counter remained1 after the synthetic inbox notice was
  removed and the accurate retained-history empty state rendered (two additional
  axe0 checks included). One controlled async checkbox caused Playwright's
  immediate `check()` assertion to fail although the request succeeded; remaining
  checks used click plus persisted-state/status assertions, without repeating
  completed Admin flows. No real SMS/email/push was sent.
- Generated extensions, source/import syntax, architecture, schema parity,
  release manifest, security/audit invariants and generated-route TypeScript gates
  passed. No full production build or hosted workflow was requested/run. React
  Doctor returned0 errors/12 reviewed warnings (existing shared-page findings,
  new orchestration complexity and guarded-error-JSON false positives). Scoped
  Semgrep found four unchanged test-loader/SQLite-PRAGMA lines, no runtime finding
  or parser error; redacted Gitleaks found0 leaks.
  Diagnostics do not certify server or provider behavior.

## Rollout, limits and rollback

Migrations `20270223120000_crm_engagement` and
`20270223121000_crm_engagement_receipts`, registered unreleased, only add User
consent fields/index, UserNotification channels/source/expiry/index and optional
unique AutomationEvent dedupe/index. Legacy repeated events keep null keys and
their existing retention; CRM receipts hold only UserId, stable journey/kind/key
and timestamps, without message text, contact address or birth date. No money,
content, contact or past-event reset. Deploy migration with the owner-approved
code, configure optional birthday field/calendar and real SMS/mail templates,
then explicitly enable intended journeys/global delivery. Background jobs must be
enabled on the active runtime; provider availability/credit and push subscriptions
remain operational prerequisites.

Provider timeout after acceptance is ambiguous; per-channel durable jobs and
existing SMS duplicate guards cannot promise exactly-once external delivery.
Queue receipts retain the existing seven-day policy and inbox records the site's
notification retention; this is not indefinite marketing attribution. Minimal processed AutomationEvent
receipts retain idempotency/cadence/pressure without contact addresses or message
bodies; ordinary processed events keep their existing two-week retention. Customers
outside a bounded page wait for continuation; newly opted-in customers behind a
completed cursor are included on catch-up. No inferred interests, automatic
coupon creation, engagement scoring, conversion tracker, AI message generator,
multistep branching journeys or production marketing activation are claimed.

To stop, turn global delivery off; member opt-out, journey pause/edit and expiry
are rechecked before each delivery. Existing inbox/history remains. Disable this
feature before a code downgrade and let the current worker finalize/skip all
pending CRM channel jobs first; older code does not understand the new consent
policy. Retain additive columns and all business data.
No reverse SQL/purge. Owner merges and deploys after review. Task-owned local
resources and temporary cookies are removed before publication; original owner
services are preserved.

Synthetic local review images: [Admin settings1440](../evidence/crm-engagement/admin-settings-1440.png), [journey390 dark](../evidence/crm-engagement/admin-journey-390.png), [retention state1440](../evidence/crm-engagement/retained-history-1440.png). No real customer/provider data.
