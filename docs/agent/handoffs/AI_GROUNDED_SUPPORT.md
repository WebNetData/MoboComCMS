# Grounded support and AI monitoring — 2026-11-09

## Ownership and behavior

This slice extends Livechat, public Search/Content, existing Settings history and
the AI gateway. It creates no second identity, search index, ticket system or
provider router. [Scenario](../../specs/ai-grounded-support/SPEC.md).

Livechat `assistant.ts` loads bounded relevant administrator passages and fresh
PUBLIC content cards for the selected types (products, magazine, software,
games, cinema, albums and tracks). Search locates candidates; its stored snippets
never enter the prompt. Drafts, future/group/member-only content, disabled modules
and maintenance restrictions remain governed by the canonical registry. Fixed
pages are not in that registry and are not offered as a source option.

Account context is still the conversation's canonical UserId, with fresh identity
checks before/after inference. Facts and the bounded transcript are user data,
not system instructions. Known citation IDs resolve to server-held local URLs;
missing/unknown references produce a clarification/ticket suggestion. Source text,
visibility, account facts and knowledge settings are checked again after inference.
Existing conditional publication prevents replies after human takeover, a newer
message or module disable. Continuous replies, manual human requests and the
existing transcript-to-ticket path remain intact. The bundled widget now preserves
complete Persian/local reference paths; external URLs stay plain text.

## Administration and privacy

Chat settings contain a typed enable switch, content types and a 1–5 source limit,
saved through existing revision/If-Match/history/audit. Turning grounding off keeps
the previous answer path. Policy passages and account context have separate bounds.

`/admin/ai/monitoring`, linked from the existing AI page, reads
`GET /api/admin/ai/monitoring` with `settings.manage` and the AI module guard.
Filters allow 1/7/30 days and a known purpose; at most 50 recent rows are returned.
Counts, completed duration, attempts, known token totals and support outcomes do
not trigger inference or health probes. Internal additive Admin DTO; no public
client/event contract was changed.

AI owns the additive `AiInvocation` table and terminal state claims. Text API,
personal ChatGPT and explicit image API use one observation per provider invocation;
authorized credential-pool attempts stay inside that record. Economy routing can
make separate recorded provider invocations. No prompt, response, key, account/user
identity or endpoint URL is retained. Errors use fixed categories/HTTP status only.
Provider-reported usage is nullable. Personal transport and image providers without
usage remain unknown. Browser Chat is outside server invocation metrics; neither
account quota, monetary cost nor unreported tokens are guessed. The history starts
with adoption, does not backfill invented facts, and is not automatically deleted.
Interrupted RUNNING observations remain visibly unfinished. A telemetry storage
failure logs a fixed warning and never retries inference or fails a valid answer.

## Executed evidence

- Native PostgreSQL on the existing `mobocom-postgres`, as non-root in the existing
  `mobocom-app`: all 178 migrations deployed to an empty task test database;
  `ai-grounded-support`, `ai-telemetry`, `livechat-continuity`, `ai-resilience` passed
  in scoped follow-ups. Coverage includes current public facts versus stale index,
  restricted/draft/future/group/module-off exclusion, changed source suppression,
  two-user isolation, takeover/new-message/disable races, API/image/personal metrics,
  real usage versus unknown, quota/no replay, authorization and telemetry outage.
- Twelve Livechat/grounding/link/usage unit cases passed without DATABASE_URL.
  Two existing AI resilience cases also passed. The broader AI unit invocation
  encountered an absent `scripts/engineering/protocol.cjs` in the development copy;
  it is not reported as an all-AI suite pass. No full release test/build was run.
- Actual local browser: settings save/reload with revision and restoration; metrics
  rendering, filters/refresh, empty/error state, keyboard focus; guest/customer and
  section-editor direct API denials. Both new Admin surfaces at 1440/390 light/dark
  passed eight scoped WCAG A/AA axe scans with no violations or horizontal overflow.
- Public widget loaded a persisted server-validated citation fixture through the real
  API: complete Persian href, ticket route/human option, and same-cookie guest
  isolation passed. Inference is covered by the native tests with synthetic provider
  responses; no real cloud account, quota or model quality was tested.
- React Doctor: zero errors and 23 reviewed warnings. The two monitoring-effect
  warnings are covered by AbortController guards after every await and a guarded
  finally reset; the remaining warnings are in existing AI/chat/widget code
  (including stateless text-part index keys), not new suppressed rules.
- Scoped two-rule Semgrep and redacted Gitleaks scans passed.
- TypeScript, architecture, schema parity, release-manifest, source and repository
  security checks passed. Detailed local receipts are in the ignored
  `.mobocom/ai-grounded-support` directory. Graphify was stale/out-of-corpus; source
  inspection was authoritative, not a graph-derived runtime claim.

## Rollout and limits

Owner merges and deploys. Apply the registered additive migration and regenerate
Prisma before starting this code. Existing application data and published releases
are unchanged. To revert behavior, disable grounding or revert this code while
retaining the new table/history; no database restore or destructive down migration.
Retrieval uses bounded canonical card summaries and relevant manual passages,
not full-document semantic retrieval. Source references do not prove every model
claim; monitor outcomes and route uncertain cases to a person. Settings/source
rechecks narrow in-flight races but do not lock content while a model runs.
No hosted workflow, new container, live provider call, production deploy or merge
is authorized by this slice. The local existing app was synchronized with changed
files for development; it remains running. Task-owned browser accounts/content/metrics
and temporary sessions were removed after settings restoration. The isolated
mobocom_ai_grounding_check database is retained for subsequent local checks.
