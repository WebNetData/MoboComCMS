# AI provider/model selection by purpose

R3; existing AI/Settings/Identity/Audit/egress owners. PR362 is owner-merged
at2b2f3289. Currently all API callers share ai.config.v1, while a trusted Admin
context can select that admin's personal ChatGPT. Extend these owners, no new
provider service, credentials system, schema, dependency or public URL.

Outcome: settings.manage chooses inherited defaults, independent API/model/key,
or personal ChatGPT (Admin purposes only) for support, Prompt Master, Admin,
Magazine, products, comments, forum, SEO, editor and section autofill.
Admin child purposes inherit Admin; support/Prompt Master inherit global API.
Absent settings preserve existing behavior, including enabled personal Admin.
Explicit API bypasses personal; explicit personal requires that admin's active
grant and fails without a paid fallback. Public purposes never use a personal
grant even inside an Admin diagnostic. No automatic provider/model fallback.

Store bounded typed routes in ai.routing.v1 via canonical Serializable JSON
Setting CAS/retry and transactional strict audit. Preserve untouched purposes
and fields; encrypt API keys using existing panel cipher. API writes accept
field patches; masked/blank keys retain only the same provider/endpoint key;
provider/endpoint changes clear an old key unless explicitly replaced. Clear
is explicit. Corrupt/unreadable state fails closed without overwriting it.
Internal GET/PUT /api/admin/ai/routing requires settings.manage, module-on;
writes also require existing Origin guard and strict rate limit. No secrets
in projection/audit. Diagnostic uses existing guarded AI action and selected
purpose only; never performs content publication. Existing section permissions
still guard real actions. Client body cannot select an OAuth actor.

Admin UI keeps existing MoboCom/SDS cards/fields, RTL, light/dark and responsive
layout. Purpose/source controls, key retention/clear hints, inheritance summary,
pending/error/save/test states; failed reads never expose writable defaults.
Only dirty field patches are sent; no stale initial response overwrites edits.
Module-off stops configuration/generation; data retained. Revert needs no
migration; disable personal first if removing its code. No live provider call,
production deployment or release is authorized by this slice.

Acceptance: focused ai-routing cases in existing ai.test.cjs; registered native
PostgreSQL ai-routing.connected.cjs (two-purpose/two-field first-create races,
encryption, corrupt retention, strict audit rollback, actual routing with
recorded upstream); context-leak/provider-bypass deliberate faults; actual
Admin browser save/reload/test/error/guest/section-only/Origin, four theme/size
axe captures. Targeted types/arch/source/security and React Doctor. No redundant
full release suite; actual credentials/plan eligibility remain unverified.
