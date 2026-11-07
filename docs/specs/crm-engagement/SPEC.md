# Continuous CRM engagement

Owner request2026-11-07: ongoing customer relationships, offers for products a
member follows, special discounts, stock return and birthday SMS. R4 scoped
extension; independent of unmerged PR368/369. Owner merges/deploys; no actual
customer/provider messages or production activation during development.

## Inventory and envelope

GOOD existing owners: Livechat CRM profile/tags/notes/timeline and customerSegment;
Identity User/profileData/custom date fields; Store stock subscriptions/cart
recovery/loyalty; Catalog product-follow price drops; Notification durable inbox,
per-channel BackgroundJob retries, mutes, delivery receipts; SMS/Mail/Push and
shared Settings revisions/audit. CRM Contact is not a second human identity.

PARTIAL: these experiences lack one coherent engagement control surface.
MISSING in the inspected tree: birthday journey, explicit marketing opt-in,
cross-journey pressure/window control and bounded ongoing CRM-targeted offers.
Generic Automation rules directly invoke heterogeneous mail/SMS/discount actions;
their completed-run log cannot safely be the marketing consent/delivery receipt.
Extend Automation with a closed marketing-journey configuration, reuse the exact
Notification/BackgroundJob delivery owner; no new transport/queue/rule language,
tracking system, Contact identity or executable expressions.

## Behaviour and contracts

- Global default-off typed Settings/history/CAS config, up to20 draft/active
  journeys: birthday, followed-product offer, CRM segment offer and win-back.
  Each has stable id/name/message/site link/channels, optional start/end date,
  bounded cadence, CRM segment/tag filters and product/purchase suppression.
  An enabled journey plus global enable is required; save/preview never sends.
- Canonical CRM RFM semantics, explicit product ItemFavorite.notify subscriptions,
  current active account and affirmative marketing consent decide recipients.
  No inferred browsing surveillance or private data sent to AI. Product offers
  require current unrestricted active/approved Store product and current follow;
  recent paid purchases suppress an offer. No automatic monetary mutations or
  generated unbound coupons; existing Promotions remains discount authority.
- Birthday maps an administrator-selected enabled custom Identity date field;
  preserve stored ISO-shaped or Persian slash values; input calendar is explicit. Select Persian/Gregorian anniversary and
  leap-day skip/last-day policy; Tehran calendar boundaries and annual dedupe.
  Missing/invalid/future birth dates never qualify. The member controls consent
  and existing per-event/per-channel preferences; existing records default out.
- Bounded, resumable user-id scans use a small existing Settings cursor per
  journey, periodic catch-up and the existing scheduler lease. Notification
  dedupe keys identify journey/member/period independently of retries or edits;
  birthday dedupe spans all journeys per member/calendar-year. Minimal already-processed
  AutomationEvent receipts preserve once/cadence/caps after inbox retention.
  Serializable consent/eligibility/pressure checks and inbox creation share one
  transaction; retry only uniqueness/serialization conflicts and SQL40001/40P01. Daily/weekly caps span all
  new marketing journeys; quiet window delays queueing/delivery. No at-least-once
  external provider is claimed to be exactly-once after an ambiguous timeout.
- Add compatible User marketing consent fields and Notification channel/source/
  expiry metadata. Extend createInboxEvent with an optional transaction client;
  retain old callers/SQL defaults. Shared delivery rechecks opt-out, current
  journey/version, selected channel, module/product/audience/purchase and expiry.
  Paused/expired/edited queued messages skip with a receipt; outside the quiet
  window they defer without consuming retries; external copies expire at the end
  of their creation day in Tehran. Transactional notices unchanged.
- Stock-return and price-drop retain their existing subscription/delivery owners.
  Add a distinct product-price-drop notification kind with SMS/email templates
  while preserving existing followed-content compatibility and opt-outs.

## UI / actors

`/admin/crm/engagement`: users.manage AND automation.manage, composing the
canonical guards; exact server checks,
Origin, bounded JSON, strict rate limits for writes/preview, If-Match conflicts,
atomic strict audit/history. Link CRM, watches/stock, promotions, recovery,
newsletter and channel settings; reuse semantic SDS/MoboCom primitives/RTL.
List journeys → clear defaults/window/caps → edit draft → bounded recipient
preview (sample/masked channels, no birth date) → explicit activate/save.
Show recent queued notices, downstream channel outcomes and suppression reasons;
CRM customer timeline includes communication references. Do not fabricate totals,
provider delivery/read/conversion metrics or claim a preview scanned every user.

Member notification preferences adds a separate opt-in describing birthday,
offers and re-engagement. No forced consent/required birth date. Origin and
canonical current UserId; a manager cannot silently opt somebody in. Both
private APIs return no-store. Empty/loading/error/conflict/retry and keyboard,
light/dark/390px cases are part of acceptance. No protected public redesign.

## Compatibility / verification / rollback

Incremental parity migration listed in release-manifest. Old notifications
continue with all default channels and empty marketing source. Existing price
follow opt-outs carry to the new specialized event. No template/body/money reset.
Default off/unpublish/opt-out stops future marketing; history/receipts remain.
Code downgrade retains additive columns; disable and let the current worker
finalize/skip pending CRM channel jobs before downgrade; older code does not know
the new consent policy. Never purge business data.

Focused domain cases plus registered scripts/crm-engagement.connected.cjs:
real permissions/Origin/CAS/audit, concurrent cap/once-only receipt, opt-out and
pause after enqueue, calendar/leap cases, module/product/private/follow/purchase
eligibility, batch cursor catch-up, partial channel failure and old notification
compatibility. Empty PostgreSQL + populated174→176 preservation as UID1000/no
dotenv. Deliberate consent, pressure and receipt-retention breaks must fail. Actual
Admin/member responsive themed browser, draft/preview/activation, private-account
isolation and synthetic transports; no real campaign/customer send. Relevant
types/source/architecture/schema/security/audit/Doctor and scoped scans, then
handoff/map/ledger/decision + owner PR. Broaden checks only for an actual gap.
