# Transactional SMS and request actions — 2026-11-15

Owner request: publish the prior Admin AI/users slice as a PR for owner merge,
then extend SMS across verification codes, Store orders/products and Forms
services, and style the request-card repeat action. Prior slice is PR476.
Continue this checkout on Windows Docker mobocom-app port3000; retain local data.

| Surface | Existing owner/evidence | This slice |
| --- | --- | --- |
| Connection, credentials, OTP, templates | sms/domain/sms.ts, sms/server/sms.ts, ippanel.ts; SMS_SETTINGS_RETENTION | Preserve encrypted credentials and defaults; distinguish configured, provider-accepted, rejected and unknown outcomes; claim settings revision and retain drafts |
| Customer notifications | notifications/server/inbox.ts and preferences.ts; existing BackgroundJob channel keys | Keep canonical queue and preferences; bind provider attempts to durable delivery identities; extend bounded Store status coverage |
| Forms workflow | forms/server/paid.ts tellSender; FORM_STAGE is defined and disabled by default | Keep held-work/claim/pickup rules, add durable status-message delivery through existing jobs and explicit recipient policy |
| SMS safety | SmsLog, strict OTP rate limits and otp-challenge | Fail closed and reserve concurrent per-phone pressure before provider I/O; never blindly retry ambiguous POST outcomes or expose codes in reports |
| Administration | /admin/sms, settings.manage | Group/search events, preview synthetic messages, show readiness reasons, filtered/paginated reports, safe errors and explicit group confirmation |
| My requests | MyRequests.tsx and forms-pro.css rq-* | Separate repeat/receipt actions from tiny metadata, current design tokens, visible focus,44px controls and responsive wrapping |

Actors: settings managers configure/send; section handlers change only work
their existing owner permits; customers retain the same UserId, verified phone
and notification choices. A form-entered transactional phone does not become
the authentication identity or grant marketing consent. No second SMS queue,
identity, template language, settings system or unrestricted Admin runner.

Keep provider keys encrypted; request bodies bounded; writes require Origin
and canonical permission, strict action limits and appropriate audit. Message
acceptance is distinct from handset delivery. Unknown delivery must be visible
and not automatically resent. Codes, pickup secrets and credentials never leave
through logs, job previews or error responses. OTP remains synchronous and
purpose-bound; concurrent issue/consume limits and session/TOTP rules survive.
Modules that are off do not deliver optional-domain messages. New event settings
are not silently activated; stored opt-outs and existing templates remain.

Extend existing models incrementally only where durable identities cannot be
represented safely. Any migration is additive, listed in release-manifest and
checked against fresh PostgreSQL and a populated upgrade. Preserve all old logs,
history and accepted receipts on rollback; do not replay old events or purge.

Acceptance: native PostgreSQL against actual source (non-root/no.env), parallel
pressure/replay/ambiguous responses/audit rollback/stale settings/OTP guards,
recording provider only, plus existing sms-settings/identity-otp/form/notification
regressions. Detect a removed delivery guard in isolated source. Full types and
scoped source/architecture/security/audit/schema gates. Real app3000 Playwright
1440/390 light/dark, RTL, keyboard, report filters, failed load/retry, preserved
draft and synthetic template preview; requests repeat/receipt links retain their
destinations. React Doctor and scoped axe/visual inspection complement tests.
No real customer SMS, production release or hosted workflow during development.
