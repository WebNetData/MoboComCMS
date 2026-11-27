# AI management desk — 2026-11-27

Checkout `.mobocom/ai-management-platform`, branch
`feat/ai-management-platform-2026-11-27`, based on merged main `d55452a8`.
Owner asked for an AI management core, per-section oversight and advice,
MoboCom/SDS-based front-end design, and a Graphify map of the platform.

- `GET /api/admin/ai/management` reads 14 bounded section indicators.
  The existing Identity guard and module state hide ineligible sections.
  CRM follows the current manager/assignee permission, and support uses
  existing department scope. Individual source failure has an unavailable state.
- Optional POST requests use the existing AI Operations route, personal
  connection, budget and strict rate limit. Inputs contain fixed labels and
  counts. Advice is accepted only for evidence identifiers from the request.
  Actor, module state and evidence are rechecked before returning.
- Approval and operational writes stay with the existing AI Operations,
  Identity and domain owners. Deployment and live provider validation remain
  separate. No migration. Rollback is the application code revert.
- The desk uses the current Persian typography, Admin buttons and SDS semantic
  surfaces, radius and focus. OpenDesign and Open CoDesign inform a task-focused
  workspace. Designer Skills and oil-ui inform state/screenshot review.
  Anthropic frontend-design, Unslop and Theme Factory inform hierarchy and
  semantic colors in both themes. The supplied Figma implementation skill
  informs component-to-token mapping. A Figma file/nodes were not supplied.
- Graphify source-only corpus was validated after making the existing
  credential and secret exclusions agree with the adapter on case.
  [Map, paths and outstanding coverage](../AI_MANAGEMENT_PLATFORM_MAP.md).

## Executed checks

- PostgreSQL 17 with 230 migrations and Node 22 under UID 1000:
  `ai-management`, `ai-operations` and `ai-admin-operations` passed. The new suite uses real ticket
  rows and substitutes identity, limiter, module and model transports.
  It covers read scope, unavailable source, foreign Origin, module off,
  unsupported scope, model evidence validation and post-inference revocation.
- TypeScript, architecture, source and security checks passed. Scoped Semgrep
  and staged, redacted Gitleaks reported no findings. React Doctor reported no
  errors. The new page retains an advisory for loading data in a cancellable
  effect. The existing Admin layout has separate complexity and framework
  advisories.
- Final production webpack build and runtime trace check passed. Edge opened
  the production HTTPS preview at 1440 and 390 px in both themes. Full Admin
  and restricted Support identities received their proper reports; guest API
  access returned 403. The desktop entry used the actual Admin menu. Filter,
  refresh, unavailable, empty and error views passed. The browser used a
  synthetic model result for the advice state. Four captures passed scoped
  axe, width and page-error assertions. No live model or production data was used.
- Raw graph and browser evidence are retained in ignored local folders.
  The disposable service and credentials are removed after verification.
