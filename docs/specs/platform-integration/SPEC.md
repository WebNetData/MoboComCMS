# Platform integration — 2026-11-14

Owner authorized all six proposed platform journeys; continue incrementally in
`.mobocom/platform-integration`, branch `feat/platform-integration-2026-11-14`
from `main` `337831b3`. Prior Store PR467 and autonomous-foundation's uncommitted
Admin extension-state snapshot remain independent; do not overwrite them.

Final integration: owner-merged Store PR467/main`68746778` is now included under
local implementation commit`96ac5736`. Both histories and check registrations
are preserved; the directly affected native/type/gate scope passed on the
new200-migration baseline. The handoff records actual browser/cleanup evidence.

## Read-only inventory and target

| Journey | Existing owner/evidence | Observation and bounded target |
| --- | --- | --- |
| Staff day view | Admin `/admin`, Identity guards, Store/Forms/Support/Journal queues | PARTIAL: business figures and section map exist; compose a permission-scoped actionable day view from existing queues, not another task engine. |
| Connected discovery | Journal `PostItemLink`, Content registry/timeline, Catalog product relationships | PRESENT/PARTIAL: directed editorial and merchandise relationships exist. Extend a verified missing public connection through these owners; no universal relation table. |
| Customer context | Livechat `crmProfile` and canonical Identity UserId | PRESENT/PARTIAL: orders, chats, tickets, wallet and marketing already joined; assess safe service/repair summaries under Forms access, never device answers/secrets or phone-based identity inference. |
| Search recovery | SearchDocument, `searchSite`, Persian normalization, Analytics `recordSearch` | PRESENT/PARTIAL: categories/facets/zero-result reporting exist; add explicit, bounded one-edit query suggestion only after zero exact first-page results. No automatic replacement or index duplication. |
| Editorial work | Journal dashboard/review/scheduling/PostItemLink | PRESENT/PARTIAL: existing pending and scheduling counts; extend a bounded editorial day/calendar/quality view using stored facts. No silent publication or invented stale-content policy. |
| Operational health | Operations monitoring/queue, Notifications backup worker, extension/update panels | PRESENT/PARTIAL: technical monitoring exists; add actionable health/backup overview and truthful unavailable/stale states, linking established recovery/update surfaces. No automatic restore, provider call or package activation. |

This is the six-journey inventory, not a whole-product maturity certification.
Graphify has no graph in this fresh checkout. Serena activation timed out after
240 seconds; exact source inspection is the fallback, not semantic/runtime proof.

## Shared contracts and implementation sequence

Preserve protected public layouts/URLs, canonical UserId, section permissions,
module switches, existing Settings/Audit/Jobs/CRM owners and historical data.
Internal reads use typed DTOs and no-store responses; the day view must enforce
each resource's permission and assignment before querying it. Empty and
unavailable are distinct. Public discovery rechecks current source visibility,
effective modules and maintenance. CRM Contact is never a second login identity.

Implement independent vertical slices: (1) day view and editorial detail,
(2) public connections and customer service context, (3) explicit search
recovery, (4) actionable health/backup summaries, then integrated acceptance.
Shared schema/runtime/docs and final review belong to the lead. No migration or
dependency change is planned; stop and reassess if source evidence requires one.
Existing extension/update controls are reused, not replaced by server execution.

UI: existing MoboCom/SDS cards, typography and semantic tokens; Persian RTL,
1440 light/dark and390 mobile, labeled controls, keyboard operation, truthful
loading/error/retry/empty and stale states. No redesign of public section pages.
No new financial writer, publishing engine, broker, task persistence or public
mobile API. Optional page-only search suggestion keeps the search JSON contract.

## Acceptance and rollback

Run meaningful affected units and actual owner functions against an empty
disposable PostgreSQL database as UID1000 without `.env`; cover foreign/member/
section denial, per-form scope, module-off, hidden content, exact-search priority,
bounded correction and corrupted/unavailable health inputs. Browser-check actual
changed flows plus scoped axe/overflow at1440 light/dark and390. Run affected
types, architecture/source/security and React Doctor; do not run full release
stack or hosted workflows. Native/provider doubles are labeled as such.

Rollback removes the new read-only compositions while retaining all original
source data, links, queues, histories and settings. Owner alone merges/deploys.
Executed results, failures and remaining work belong in the existing shared
handoff and ledger; this spec records planned acceptance, not passing tests.
