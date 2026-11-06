# Approval-only operational AI assistant

Slice2 supersedes the absolute approval requirement below: [explicit direct
execution for one request](DIRECT.md). Review remains the default; direct tools
are independently opt-in and never run on a schedule. The original slice below
records the preserved owner/transaction and review-mode baseline.

R4 bounded vertical slice; owner decision2026-11-06: **all mutations are
proposals first and execute only after explicit Admin approval**. Base is
owner-merged PR363/main3e9600a7. Existing AI, canonical Identity, Settings,
Content/Editor/Journal/Catalog/Store/Audit owners remain authoritative.

The AI creates at most3 typed independent proposals from a bounded request and
permission-filtered current context. It never executes a tool, SQL, URL, code,
payment, password/account change, or background action itself. Supported
commands: create Magazine article/page, publish an existing article, create a
product with its reviewed exact price/stock/visibility, internal order note
and allowed paid-order fulfilment transitions. Refund/manual payment/cancel/
restock and customer messages are outside this slice. Existing Automation is
still the owner of unattended rules; no second queue/scheduler is added.

Exact permissions: cms.posts (Magazine only), cms.pages, cms.products,
orders.manage. Every proposal belongs to its requesting canonical user; only
that user with the still-current action permission can see/approve/reject it.
settings.manage controls allowed commands/limits. Module-off/policy-off or
revoked permission denies execution. Public support cannot access these APIs
or personal quota. Dedicated operations AI purpose inherits Admin.

New AiAssistantProposal is domain approval state, not a job queue. Immutable
bounded args/preview/snapshot + owner + expiry + approval version + result.
PROPOSED→APPLIED receipt and strict audit commit in the same owner transaction
as the actual write. Reject uses a claimed write. Replays return the existing
receipt, concurrent approvals apply once, audit/claim failure rolls back the
business mutation. Existing record version/assignment/status changes invalidate
approval; no automatic regeneration/retry with different parameters. All
proposals in a generated batch are validated before any are persisted.

Creation reuses shared owner commands, canonical revision history/events and
MoboCom documents (content.richText with checked plain-text paragraphs; legacy
fallback only if block editor off). Product uses productInput/exact money,
category validation, price history and canonical revisions. Orders reuse
lockOrderWork/canMoveTo and paid-state guards; no guessed payment/delivery
secret or silent bypass of another staff member's claim. External content is
untrusted data; model IDs/permissions are never authoritative.

UI /admin/ai/operations: instruction, visible capabilities, concrete per-action
preview/target/status/price/publication consequences, approve/reject and durable
result/history links. Pending/error/empty/expired/stale/module-off/permission
states, RTL1440/390 light/dark, existing MoboCom/SDS controls. No raw JSON editor
or arbitrary tools. No mutation, release, real account consumption or production
deployment is performed by implementing/testing this feature.

Acceptance: pure schema/prompt/closed-tool tests in existing AI suite; native
PostgreSQL proposal/action atomicity, replay/concurrent approval, snapshot and
permission revocation, held work, audit rollback and schema upgrade; deliberate
unapproved/permission/stale faults; real browser propose/review/approve/reject/
history/error/guest/section-only/Origin and responsive axe evidence; scoped
types/architecture/security/schema/migration/React Doctor gates. No redundant
full stack. Additive migration in both schemas and release manifest; rollback
retains proposal/audit history and hides the optional surface.
