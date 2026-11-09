# Grounded support and AI request monitoring

## Outcome and existing owners

Extend the existing continuous Livechat, AI purpose router, public Search/Content
registry, Settings history and ticket conversion. Support answers use bounded
admin policy passages and fresh public cards with server-validated references;
private facts stay restricted to the conversation's canonical signed-in UserId.
An AI-owned invocation record measures server-side calls without retaining prompts,
answers, credentials, customer identities or endpoint URLs. It is not a second
audit, job queue, identity, billing ledger or search index.

Existing: `livechat/server/livechat.ts` owns conditional reply/human takeover;
`chatPrompt` already restricts scope; canonical Search/Content check visibility;
AI routing/credentials own model selection and bounded rejected-key failover.
Missing: retrieved public references, reference validation and durable invocation
duration/outcome/provider-reported usage. Configuration readiness is not live health.

## Scope and authority

- Public support continues through the existing visitor token/requireUser path.
  Customer facts never accept a user ID from the message/model. No financial writes.
- Existing `support.chat`/settings handlers own knowledge controls and audited CAS.
- Monitoring GET requires `settings.manage` and the enabled AI module; it exposes
  aggregate/sanitized request facts only. No probe/model call on status reads.
- Public content comes through Search and fresh Content cards; PUBLIC only,
  enabled modules, current maintenance/audience/publication filters. No body from
  a stale search index, draft, restricted item or raw arbitrary URL is supplied.
- Retrieved text and account facts are data in the user message, never authority
  in the system instruction. Citation IDs resolve only to the supplied sources.
  Missing/invalid evidence asks for clarification or the existing ticket/human path.
- Recheck source visibility and knowledge settings before publishing a delayed
  answer; suppress it after takeover, newer input or module disable as today.
- Existing ticket path/conversion retains the transcript/references; no automatic
  outbound message, account mutation, refund, duplicate ticket system or inference.

## Data and monitoring

Add `AiInvocation` in both Prisma schemas with safe purpose/kind/transport,
provider/model, RUNNING/SUCCEEDED/FAILED, timestamps/duration, attempt reservations,
optional validated provider-reported token counts and closed error/outcome labels.
Missing usage stays unknown; no estimated prices, guessed account quota or fake
zero usage. Text API/personal and explicit image API use this same owner. Browser
Chat quota/model latency cannot be measured by a server API and is disclosed.
Telemetry failure cannot trigger another inference or break an otherwise valid
answer. Unfinished records remain unknown, never fabricated failures/successes.
An additive migration preserves old rows; rollback ignores the new table.

## Admin and UI

Extend the current chat settings with typed grounding/source-count controls. Add
`/admin/ai/monitoring` plus its guarded read-only API and a link from the existing AI
page. Reuse MoboCom/SDS cards, native labelled controls, semantic lists, RTL,
light/dark and1440/390 layouts. Empty, loading, forbidden, missing-migration and
unavailable usage states are explicit. No new visual identity or UI dependency.

## Acceptance

Focused units: bounded Persian passage selection, prompt injection as data,
known/unknown citations, numeric usage validation, classification and no hidden retry.
Connected PostgreSQL: public/draft/restricted/module-off source filtering, freshness
change, two-user account isolation, continued replies/human takeover, telemetry
success/failure/missing usage and monitoring direct-entry authorization. Register
the native checks; mutate source visibility/ownership during checks and detect it.
Actual browser: existing chat settings save/reload, grounded public answer and
references, human/ticket route, monitoring filters/empty/error and secret-free data;
four themed/responsive views with scoped accessibility checks. Use only relevant
gates; no hosted workflow, new container, full release build or production deploy.
