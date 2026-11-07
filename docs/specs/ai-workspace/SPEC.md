# Contextual AI workspace

Outcome: the existing AI tools are reachable from the current Admin workspace.
The staff ManageBar also carries a public pathname to the existing operational
desk. Extend AI/Workspace/Builder owners; no second assistant, model client,
identity, queue or execution engine.

Actors: existing section permissions for operations; cms.pages/posts/products or
settings.manage for Design Studio; server.manage AND settings.manage plus panel
unlock for engineering. Navigation visibility is advisory; every existing API
rechecks current permission, module/policy and resource scope.

Flow: open the modal with keyboard focus; describe a task; choose content,
design or engineering. Content uses the same operational proposals, review and
single-request direct-execution grants. Design/engineering receive a bounded
draft in the same browser tab for ten minutes, bound to canonical actor and tool;
no model call or write happens on handoff. Design applies an inspected proposal
to the builder draft; code work uses isolated engineering and owner deployment
approval. The receiving form remains editable and requires explicit submission.

Context contains only a bounded pathname, never query/hash, page DOM, form values,
credentials or customer records. Draft storage failure leaves the text available
with an actionable error. Expired, oversized, different-account or wrong-tool
drafts fail closed. Modal Escape/close restores focus. Client module navigation
refresh and server guards preserve module-off behavior. Source changes need
no schema migration; rollback leaves all content/history intact.

Acceptance: the two reported workflow regressions pass without weakening the
claimed handoff or strict limiter; native PG proves handoff status on both SSE
channels and operational permissions/review/idempotency; unit checks cover draft
scope, expiry and limits. Real browser proves page proposal/review, Studio-to-
builder and engineering handoffs without automatic calls, keyboard focus,
1440/390 RTL in both themes and scoped axe. A section-only account lacks server
work and existing APIs reject forbidden calls. Run changed-file Doctor and
types/source/architecture/security once; no repeated release build.
