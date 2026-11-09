# Contextual Admin assistant

R3 (private resource reads/permissions). Extend AI's existing Workspace dialog,
purpose routing/personal grant, canonical engineering knowledge and Operations
handoff. No new chat widget, identity, job queue or database model.

Outcome: ask follow-up questions inside the current Admin page, optionally attach
the saved selected resource or manually supplied text, copy the suggestion, or
review its instruction in the existing content/builder/engineering tools. Responses
are advice, never executable commands or automatic content/financial mutations.

The shared CRUD form registers only its typed kind/id, not field values. A small
layout-local React context binds selection to the current actor/path; unmount,
navigation, selection or account changes reset private conversation state. No
transcript in local/session storage. Fields/DOM, cookies, env, customer messages,
server diagnostics and credentials are never scraped. Unsaved input is attached
only by the administrator explicitly pasting chosen text.

GET/POST `/api/admin/ai/context` is an additive internal Admin DTO. Server-owned
page metadata selects exact canonical permission/module/purpose and permitted
resource kind. Current `requireAdmin`/`requireContentScope`/`requirePerm` authorize;
authors remain restricted to their own records. Module-off, wrong section, foreign
record, invalid path/kind/id and stale access fail closed. Saved-record context is
opt-in and uses bounded safe projections. Orders expose state/amount only, never
customer contacts or payment secrets. A fresh authorization/resource comparison
after inference suppresses outdated private output. Client context is never proof
of authority. Unknown pages get guide-only generic context, with no resource reads.

GET opens without inference. POST retains Origin policy, strict per-user limits,
bounded JSON/question/history/selection and existing provider deadlines/no hidden
replay. Model text is rendered as plain text; no model HTML/JS/actions. Existing
AI invocation monitoring records ordinary calls without prompts or identities.
Use the matching existing purpose/model and personal connection of this actor;
no browser-Chat transport, account quota claim or personal-to-paid fallback.

Keep native dialog/focus restoration, scoped SDS/MoboCom tokens, labelled controls,
loading/empty/error/disabled/copy feedback, Persian RTL and 1440/390 light/dark.
The existing Operations UI owns reviewed/per-request-direct execution and audit.
Page/builder/engineering navigation remains an explicit button; a reply alone
cannot execute, save, deploy or open a PR.

Acceptance: bounded domain cases; native PostgreSQL manager/author/wrong-section/
customer/guest/module/Origin and changed-source/role races; no model on GET and no
content write on POST; actor-isolated purpose/personal routing; actual browser
selection/consent/multiturn/copy/navigation reset/keyboard, errors and four themed
responsive scoped accessibility views. Relevant type/architecture/source/security
and React Doctor checks only; no release build, hosted workflow or new container.
No migration or external API/event break. Rollback removes new contextual UI/API;
existing workspace tools and all content/data remain.
