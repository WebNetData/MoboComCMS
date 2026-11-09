# Contextual Admin assistant — 2026-11-09

Extends the existing AI Workspace dialog, per-purpose router, personal Admin
connection, canonical knowledge and reviewed/per-request Operations. Base is
owner-merged PR387/main6f056c06. [Scenario](../../specs/ai-contextual-admin/SPEC.md).

## Behavior and ownership

The shared CRUD/MediaCrud forms register only the active saved record's kind/id
through a layout-local React context. The assistant opens inside the current page,
supports bounded follow-up questions, manual text selection and copying a reply.
Saved-record context is opt-in. It never scrapes forms, editor engines, cookies,
environment, credentials, customer messages or browser DOM. Unsaved text is read
only if the administrator explicitly pastes chosen text into the assistant.

AI's closed page metadata chooses the exact existing section guard, module and
purpose. Magazine authors are held by `authorId`; specialist authors by
`createdById`, through canonical `requireContentScope`. Supported saved projections:
posts, pages, products, software, games, cinema titles, tracks/albums and catalog
orders. They contain bounded relevant text, title/status and safe catalog facts;
orders contain state/amount only, never customer/contact/payment metadata. Money
uses exact canonical decimal formatting and explicit currency. Unknown pages are
guide-only and accept no resource projection; they do not read arbitrary settings
or live server state. The source projection is not every field in a specialist form.

GET `/api/admin/ai/context` returns page metadata only, without inference or record
body. POST uses Origin, strict per-actor limits, bounded JSON/history/manual text,
fresh permissions and optional private projection. Model instructions use the
existing verified canonical rules/source inventory with an 8000-character knowledge
budget; no privileged custom-skill policy or live diagnostics are exposed. Facts
and history remain user data. Actor/purpose come from the server, not the client.
Metadata stamps the current canonical actor id; POST compares that hint against
fresh authenticated identity before inference, so stale cross-account history is
refused rather than forwarded. The hint never grants authorization.
Access, ownership, module and meaningful record fields are checked again after
inference. Changed/removed/forbidden sources suppress the delayed response without
replaying a model call. Existing gateway/pools/personal errors and invocation
monitoring remain authoritative; no browser-Chat transport or paid fallback added.

Replies are plain-text advice: no HTML execution, save, publish, money state change,
proposal creation, notification, PR or deploy. Explicit handoff opens existing
Operations/Builder/Engineering. Operations keeps its own policy, fresh guards,
review default and optional per-request direct choice. Complex editing still uses
the canonical block document/editor, not assistant-generated editing-engine output.

Conversation lives only in component memory, is bounded to eight turns/6000
history characters and resets on close, tool switch, route/record/account change.
Closing aborts browser waiting; an already dispatched provider call may still
complete and is not replayed automatically. Reopening starts at contextual chat.
Native dialog, focus restoration, sticky close/header, bounded keyboard-scrollable
history and existing SDS/MoboCom tokens preserve RTL/light/dark/mobile behavior.

## Executed evidence

- Three scoped workspace/domain unit cases passed without DATABASE_URL, including
  old brief compatibility and new path/id/history/injection bounds. The existing
  targeted `cms.posts` permission inventory case passed; its new entry maps only
  Magazine to that permission. No security test/baseline was weakened.
- Native `ai-page-assistant` PostgreSQL check passed as UID1000 on the existing
  isolated test database: actual JWT/current roles, manager/own-author/wrong-section/
  guest/customer, no inference on GET, opt-in context, per-actor/purpose binding,
  bounded history, Origin/rate/module denials, source/status races, exact money and
  private order projection. Advice changes neither content nor proposals/orders.
- Actual local browser on existing `mobocom-app`: CRUD selection, opt-in/manual
  context, no form scraping, two-turn exchange/copy, escaped model text, unchanged
  unsaved form value and review-only Operations handoff passed before the first
  run exposed a reopen-mode bug. The bug was fixed and the scoped continuation
  verified reopen/reset, recoverable error/no replay, long reply, Escape/focus,
  SPA Builder handoff/no inference and real wrong-section/customer API denials.
- Four final 1440/390 light/dark dialog axe A/AA scans returned zero violations
  and no dialog overflow; screenshots reviewed. The native modal prevents focus
  reaching background page controls; browser chrome can receive focus normally.
  The first harness incorrectly treated chrome focus as a page escape; no custom
  focus trap or product security control was added to satisfy that assertion.
- The continuation reached its last author step but the cold preview exceeded
  its wait. A targeted author-only follow-up waited for actual readiness and
  confirmed the entry, current own-record metadata200 and enabled question field.
  The existing Journal list also displayed a list-fetch warning during that
  fixture; the whole Journal editor is not recertified by this slice.
- A final focused browser seal on the current source verified actor-bound POST,
  clearing on409, explicit metadata retry without inference replay, focus return
  and no page errors in that flow. The native test also rejects a mismatched
  actor hint before any model call. No entire broad suite was rerun for that guard.
- Model replies in browser and inference boundary in native tests are synthetic;
  no live cloud quota, account quality or provider reachability is certified.
  TypeScript, architecture, source and targeted permission checks passed. React
  Doctor has zero errors and40 reviewed warnings; existing large-shell/CRUD warnings and the new async
  cancellation/finally checks are reviewed without suppressions. Local receipts:
  `.mobocom/ai-contextual-admin` and `/tmp/ai-page-*` in the existing app.
- Repository security invariants and scoped two-rule Semgrep passed. Redacted
  Gitleaks exited1 for one unchanged RFC6238 TOTP test-vector assertion at
  `scripts/account-security.test.cjs:157`; the line was verified equal to base.
  No new credential finding or ignore/baseline change; do not report raw scan0.
- Task-owned browser accounts/roles/drafts/session files were removed. Cleanup
  verified the unsaved form value was never persisted. Original development
  services/data and the existing isolated test database are retained.

## Adoption and rollback

Owner merges/deploys. No schema, migration, dependency, protected public design,
existing URL, release asset or hosted workflow change. No new container or production build
was created; source was synchronized into the same development app. Reverting this
slice restores the previous Workspace without deleting data; stored Operations
receipts and documents remain with their owners. Module-off behavior is server
enforced and hides the entry. This is contextual advice with explicit tool handoff,
not arbitrary unattended editing or a complete live-site diagnostics agent.
