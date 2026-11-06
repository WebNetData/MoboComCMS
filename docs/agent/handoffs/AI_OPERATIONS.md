# Approval-only AI operations — 2026-11-06

Owner: all changes must first be proposed and execute only after their explicit
Admin approval. Branch `feat/ai-operations-2026-11-06` from owner-merged PR363,
main3e9600a7. [Spec](../../specs/ai-operations/SPEC.md),
[Persian operator guide](../../AI-OPERATIONS-FA.md).

## Implemented boundary

Existing AI owns a closed six-command proposal workflow, not an autonomous
general-purpose agent. Model output is bounded typed data, never SQL/code/URLs
or executable tool calls. Supported: Magazine/Page creation, existing Magazine
publication, basic Catalog creation, internal Store order note and allowed
paid-order PROCESSING/PACKED/SHIPPED/DELIVERED transitions. Payment, refund,
cancellation/return/restock, identity/permissions, arbitrary messages, external
carrier execution, other specialist domains and unattended execution are absent.

| Owner | Contract |
| --- | --- |
| `ai/domain/operations.ts` | Closed tools, exact section permissions, strict primitive fields/price/currency/stock, no hidden args, bounded plans/questions; planner only sees permitted schemas |
| `ai/server/operations/` | Permission/module-filtered bounded context, sanitized previews/preflight, private own proposals, policy, canonical dispatch and atomic receipts |
| Journal/Catalog `server/create.ts` | Shared creation transactions used by existing CMS and approved assistant; normal categories/format/relationships/prices/revisions/events preserved |
| Site Page/Editor | Existing page creation transaction + canonical MoboCom content.richText document with checked plain text; escaped legacy fallback when block editor off; no silent paragraph truncation, line breaks retained |
| Journal review-bulk | Existing version claim, review rules/notice intent; optional atomic caller receipt, publication events after commit |
| Store orders/order-work | Existing paid-state/canMoveTo/assignment guard; optional before-write/commit callbacks. Reviewed order writes use Serializable; work-row version is conditional and monotonic so competing stale proposals cannot both apply |
| Settings/Identity/Audit | Canonical JSON-setting CAS, current section guards and strict transactional audit; no second identity/settings/audit service |

`AiAssistantProposal` is domain approval history, not a parallel job queue.
Canonical User relation is nullable/SetNull on deletion, preserving history.
Bounded immutable args/preview/snapshot, owner, model, batch,24h expiry, decision
and result; PROPOSED→APPLIED/REJECTED only. Claim, actual owner mutation, receipt
and strict audit share one transaction. Replay returns the existing receipt;
audit/claim failure rolls back creation/state change. Multiple proposals are
independent; there is no approve-all or dependency chain. A changing source
version/assignment/status requires a fresh proposal. No automatic retry using
different parameters and no secret/provider fallback.

Dedicated AI purpose `operations` inherits Admin, including per-admin personal
ChatGPT. It can explicitly select an API through PR363 routing. Public support
has no access to this API or grant. Existing Automation remains the only owner
of unattended rules; no new scheduler/job handler was added.

Internal `/api/admin/ai/operations`: GET own currently permitted previews/history,
POST propose/approve/reject, PUT settings.manage policy. Module/section gates,
Origin and strict rate limits apply; plan10/10min and general review90/10min are
separate. POST approval requires literal action and `approved:true` plus current
proposal version. Only the requesting UserId with the still-current section
permission can decide it; ownership is also bound in the database claim.
Store specialists with only store.orders.handle are not promoted to managers.
The model never receives order input secrets/meta/addresses or API/OAuth keys.
Reads/writes are bounded; responses private/no-store. Last30 rows are shown,
not purged, and revoked section previews are filtered even if another section
remains permitted. Admin settings control enabled tools/1–3 proposals, never
disable the human approval requirement.

## Data and compatibility

Both schemas add `AiAssistantProposal`; additive migration
`20270220120000_ai_assistant_proposals` is registered by name in `unreleased`.
All8 existing release seals stay unchanged. Empty171 baseline plus the additive
upgrade to172 migrations preserved an existing User/Post byte-for-byte at the
Prisma projection. No existing content conversion, price reset, dependency,
public route/layout or schema-field removal. CMS creation now delegates to the
same owner commands instead of duplicating a second assistant write path.

## Actual verification

Ignored evidence: `.mobocom/ai-operations/`; only synthetic accounts/provider
responses, private dedicated databases and a separate non-root Node22 runtime.

- Final affected **130/130 units, zero skips**, AI/Livechat/Identity/Journal/
  Store/FX/price checks; initial failure was the explicit Magazine permission
  registry, updated for the two verified Magazine-only files. Later checks
  were targeted to actual changed guards/formatting, not full release reruns.
- Native PostgreSQL `ai-operations`: no content before approval; missing/
  malformed approval, other actor and revoked permissions; once-only concurrent
  creation and notes/replay; two different stale proposals competing for one
  order; policy/module-off/expiry/reject; stale publication/assignment; strict
  audit rollback; real canonical post/page/product save, exact12345minor units,
  existing CMS legacy behavior, sanitized excerpt, line-break preservation and
  block-editor-off fallback. Invalid product/category preflight creates no
  proposal. Tests restore own settings/layouts and delete own data in finally.
- Affected registered `editor-groups-experts`, `journal-review`,
  `content-revisions`, `content-management` passed. Migration/empty-upgrade,
  schema parity, final types/architecture/source (2503), security/audit, money
  primitives and money-UI gates passed. No schema checker or baseline weakened.
- Real browser: propose/review/approve/reject, content/product creation only
  after approval, once-only replay, stored history/reload, stale and paid-order
  flow, invalid tool/missing-facts question, privacy, Origin, guest, section
  isolation, actual permission revocation and module-off. Separate final probe
  proved partial permission loss hides old previews while another section
  remains usable. Four1440/390 light/dark workspace/review states: axe0, no
  overflow, captures visually inspected. First realistic run exposed a shared
  plan/review request budget, fixed by separate strict limits and revalidated.
- Three isolated PostgreSQL faults detected: missing human approval, cross-
  admin execution and ignored stale snapshot. Removing only the preflight
  actor check was still blocked by the independent DB owner claim; bypassing
  both bindings was caught. Mutants/databases did not touch the verified app.
- React Doctor: zero errors,11 reviewed warnings (two bounded new UI branching
  warnings; nine existing Admin layout/AI patterns). Scoped Semgrep passed.
  Redacted Gitleaks exited1 for **one unchanged RFC6238 unit-test vector** at
  account-security.test.cjs:157; verified identical to base and reviewed as a
  test fixture. No ignore/baseline change and no zero-findings claim.
- Local Graphify source graph refreshed incrementally/code-only, zero semantic
  tokens. It is architectural source evidence, not runtime/authority proof.

No real ChatGPT/API usage, external customer communication, production account/
data mutation, production build/full release stack, hosted workflow, merge or
deployment. Recorded providers do not establish real-model planning quality,
account eligibility or destination connectivity. Final product preflight,
excerpt/editor compatibility refinements received native/types checks; existing
browser evidence remains scoped to the recorded paths rather than every tool
or specialist domain. Reuse existing personal OAuth login evidence; not rerun.

## Adoption and rollback

Owner merges/deploys; release must include the new migration/client generation.
Operator chooses its dedicated AI purpose and reviews each concrete proposal.
This is a first bounded operational slice, not full-site autonomous parity.
Future tools must extend the closed registry and the real owning command with
the same approval/permission/version/audit transaction, not add arbitrary code
execution or a competing scheduler. Keep automatic modes out unless the owner
makes a new explicit decision and their contracts are implemented.

Disable operations via its policy (or the existing AI module) before rollback.
Revert code normally; retain proposal/Audit history and the additive table.
No destructive down migration or data purge. Applied content/order states stay
real owner data and are corrected through their normal screens/history. Module
disable preserves them; reinstall never silently replays approved actions.
