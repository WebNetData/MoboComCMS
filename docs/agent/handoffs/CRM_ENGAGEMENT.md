# Continuous customer engagement — 2026-11-07

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
