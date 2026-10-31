# Editorial styling, team scopes and expert work — 2026-10-30

Continue the authoritative checkout and retain the pending editorial-media batch. Owner requests removal of article templates, stronger page styles, attractive BBCode authoring, correct global/section/forum groups, manual and automatic activity degrees, and principled form/order specialists.

## Audited owners and actual gaps

| Concern | Existing owner | Gap / continuation |
| --- | --- | --- |
| Article templates / page appearance | Journal post styles, Site Builder, Classic / canonical Editor | Template and format controls crowd authoring; retire article-template creation/selection, retain historical data/render compatibility and unrelated page/product builders. Extend page-style controls and selection previews. |
| Rich text | shared sanitation, Editor registry, Classic and lightweight adapters | Add bounded allowlisted BBCode and an accessible visual insertion palette; never raw scripts/CSS or an independent editor. |
| Site groups | Identity Role/section managers/staff guard | Preserve exact section keys; fix permission-only role PATCH and full-role editing; add explicit whole-site deputy and narrow expert presets. No activity-based staff grants. |
| Forum groups/team | ForumGroup / category moderator / viewerFor | Existing forum admin, deputy and category-family scope remain; expose actual staff role alongside forum rank. |
| Activity degrees | Forum settings levels / levelFor | Automatic levels already exist; add a nullable manual level id on ForumProfile with automatic fallback when a definition is removed. This never changes trust or access. |
| Form specialists | Forms handlers / assignee | Already scoped; close concurrent take/reassign race with a claimed update and retain private held work. |
| Store specialists | Store orders/delivery/events | Add a narrow plugin permission and nullable order assignee; reuse existing queue/detail and timeline. Managers assign active eligible staff; experts only their assigned paid store orders and unassigned queue, cannot manage finance/refunds/catalogue or colleagues' held work. |

## Contracts and acceptance

Only existing section permissions administer their resources. Role CRUD remains `roles.manage` plus existing staff guard restrictions. Forum administration remains `forum.moderate`; deputies and assigned moderators operate through current public scoped moderation, never gain other sections. Level override uses forum administration and an existing named level. Changes are audited. Form work uses `forms.handle` / manager `cms.pages`, same existing handler selection and secret boundary. Store specialist uses `store.orders.handle`; manager remains `orders.manage`. Explicit origin checks, current account standing, module-off and financial state claims remain.

Incremental additive migrations in both schemas and release manifest retain all rows and default to existing behavior. Never delete authored bodies, revision history, old layout documents or users. Keep one identity and one role resolver. UI uses current MoboCom/SDS tokens, light/dark/RTL and phone layouts, real error/retry/pending states. Relevant connected PostgreSQL and intentional-fault tests cover scope, manual versus automatic degrees, concurrent claims and rollback; actual browser evidence covers authoring/persistence, team/degree controls and specialist assignment. Record exact commands/results in the handoff. Owner merges/deploys; no hosted Actions or PR request in this turn.

Implemented continuation: nullable degree/order assignee migration plus occupied Role deletion RESTRICT migration are registered under unreleased. The FK closes the concurrent assignment/delete path that could otherwise promote roleId-null staff accidentally. [Actual files, checks, browser evidence and rollback](../../agent/handoffs/EDITOR_GROUPS_EXPERTS.md).
