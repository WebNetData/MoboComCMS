# Per-event external notification preferences

Goal: Let a member disable SMS, email or web-push copies for individual event kinds while keeping in-app notices.
Owner: `notifications` owns mutes and the member API; SMS, mail and push enforce the preference at their delivery boundary.
Risk: R3 (additive schema, owner-scoped settings, external-delivery behavior).

Inputs / outputs:
- Authenticated preferences GET/PATCH use a bounded catalog of existing event kinds and available channels.
- A unique `(userId, kind, channel)` row represents an opt-out; absence preserves existing delivery.
- Provider senders check current opt-out after their existing global/account eligibility checks.

Invariants:
- In-app inbox events are always created and remain idempotent.
- Existing users keep their prior external-channel defaults.
- OTP, admin broadcasts, newsletter and marketing campaigns retain their own contracts.
- No remote send occurs inside a database transaction.

Allowed scope: Additive User relation/model/migration, notifications API/UI, checks in account-event provider entry points, focused validation.
Forbidden drift: Parallel notification queue, provider rewrite, mandatory preference backfill, theme replacement.
Failure / race cases: Invalid kind/channel/value is rejected; duplicate toggles converge through uniqueness; a sender reads the latest committed preference when delivery starts.
Proof required: schema parity/migration, auth/owner/bounds checks, provider gate checks, browser preference persistence/RTL/dark QA, static checks and PostgreSQL build.
