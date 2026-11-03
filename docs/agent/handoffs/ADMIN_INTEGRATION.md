# Admin organization by area — 2026-11-03

Owner: management had grown complicated and things were not where they belonged. Branch `feat/admin-organization-2026-11-03` from main `55aa68ae`.

- **Found:** 32 groups and about 170 links; 19 groups under «site sections», of which server panel, optimization, repository, popups and ads are not sections; Happ next to SMS; two entries called «داشبورد جامعه»; `/admin/celebrities`, `/admin/studios` and `/admin/product-deliveries` in no menu; two rows marked on nested pages; the admin home an error for every section manager.
- **Done:** decision in PLATFORM_DECISIONS 6D. No address, permission, API or data changed. Links only moved, were renamed shorter or were added.
- **`/admin/studios`:** its API asks for both `games.manage` and `cinema.manage`, so the menu lists it under `settings.manage` and section managers reach it from their tabs as before. A software manager's tab there still answers 403; unchanged here.
- **Left:** the pages inside still use several header styles (`sa-head`, `appbar`, `ao-hero`); the store's tabs and its menu group repeat each other. Bringing pages to one frame is a page-by-page slice.

# Admin presentation and main integration — 2026-10-19

## Resume here

Authoritative worktree: `.mobocom/autonomous-foundation`, branch
`fix/admin-main-integration-2026-10-19`, from main `64134402`. The owner's
Admin commit `83b7d306` is retained as cherry-pick `4c138753`. This combines
the existing Admin work with merged PR201's Next16.4.2/React19.3.1/TS7.0.2
pins; it does not redo the navigation delivered by merged PR199/200.
[Scenario](../../specs/admin-main-integration/SPEC.md).

## Changes and boundaries

- `src/app/admin/layout.tsx` loads `admin-tidy.css`; root layout does not.
  Every selector is rooted in `.admin-shell`, including utilities and nested
  media queries. `:where` preserves specificity for existing rules. Global
  CSS can survive a client transition, so moving its import alone is not enough.
- Existing MoboCom/SDS tokens provide readable Admin action, muted, accent and
  danger colours. Public brand tokens are not overwritten. Existing owner
  labels, shared CRUD formatting, table scrolling/sticky actions and layouts
  are retained. User-role and Finance period controls have accessible names;
  Roles form labels are connected; the scrollable chart is keyboard focusable.
- Audit query defaults use the canonical routing hook under Suspense. A request
  generation guards results/loading, including StrictMode/unmount and clearing
  filters during a request. Errors are announced, and retry keeps native form
  interaction. Numeric audit targets alone do not imply revision support:
  automatic links are limited to positive IDs of the three existing CMS owners;
  other owners retain their own form/history links. No permission is granted here.
- Lease, Journal picker and scheduling unit fixtures now reflect existing
  settings re-exports, response headers/revision and strict transactional
  revision calls. Production guards and assertions were not weakened.

No dependency/schema/migration/API/permission/financial-state change in this
follow-up. The existing Identity, CMS, settings, audit and history owners remain.

## Executed evidence

- A clean owned Linux snapshot installed the committed lock with `npm ci
  --ignore-scripts --no-audit --no-fund`. Both snapshot and localhost runtime
  actually report Next16.4.2, React/DOM19.3.1 and TS7.0.2; JS test loaders retain
  the main branch's `typescript-api` alias5.9.3. No package pins were changed.
- Linux UID1000, no `.env`: the complete `test:site` file list ran with Node
  test concurrency2: **705 passed, zero failed/skipped**. Full native TS7
  typecheck, architecture, source2038, security and audit gates passed.
- All existing migrations deployed to a new isolated PostgreSQL database.
  Registered `content-management`, `section-settings-history` and
  `content-restore-atomic`, plus existing standalone
  `navigation-control.connected.cjs`, passed. Native injected audit-outage
  messages are expected rollback tests, not an unhandled application failure.
- Actual PostgreSQL-backed localhost browser: full/journal-only/member/guest
  identities; Journal-only metadata and settings save/reopen; stored article
  body/status preserved; direct cross-section/member/guest writes403; missing
  and foreign Origin403 through the actual Next16 Proxy. Original settings
  are restored, and fixture cleanup claims the exact final raw value.
- Maintained `e2e/tests/admin-presentation.spec.ts`: **3 passed, zero retries**.
  Actual draft save/reload and preserved input after injected503; public CSS
  probes before/after a proven same-document Admin→Home transition; query
  hydration, delayed old audit result/clear, failure/retry, empty state and
  keyboard details. The audit list's deterministic responses are client-state
  tests, distinct from actual database/permission evidence above.
- Fourteen Admin surfaces ×1440/390 ×light/dark: final **56-view matrix has
  no scoped WCAG2A/AA/2.1AA axe findings, page errors or document overflow**.
  Initial passes found contrast, labels and chart-focus defects, which were
  corrected. The full second matrix cleared52 views; the four Roles views
  were rerun after the danger-colour fix. Four Audit views were rerun after
  the final link/Suspense change. Screenshots of Users before/after, Audit
  and mobile dark Roles were inspected; no wholesale visual redesign.
- React Doctor0.9.17 on54 affected TSX: exit0, **zero errors/337 warnings**.
  Its initial blocking browser-global hydration finding was fixed. Remaining
  warnings concern existing broad forms (labels, complexity, async/effects,
  keys and parsing), plus initial Audit fetching/date formatting. These were
  not suppressed or all individually cleared; this is not whole-Admin certification.
- A deliberately unscoped `.btn-secondary` in the owned snapshot failed the
  new boundary regression. Original CSS was restored and the check passed.
- Production `next build` ran successfully with the pinned dependencies,
  isolated PostgreSQL client and4GiB heap. Final rebuild and cleanup status
  are recorded at the delivery checkpoint below.
- Redacted changed-file Gitleaks scan: exit0, zero findings. No policy/CI
  baseline was relaxed. No hosted workflow dispatch/rerun, push, PR, merge
  or deployment is authorized by this task.

## Failed attempts and limits

The first source copy omitted deploy/example files: its25 failed tests were
not counted as success. Completing the tracked snapshot exposed five stale
unit-fixture failures, repaired without changing production behavior. Initial
browser execution before startup readiness got an empty response; a test's
unscoped alert locator also matched Next's announcer. Both were corrected
before the three successful maintained cases. Native build/Doctor tool
startup attempts and diagnostics remain in ignored local logs.

The56 views cover named surfaces, not all state combinations of the58-file
owner batch. Most remaining Doctor warnings, every optional integration and
production provider/load/deploy/rollback evidence are outside this task.
Do not infer universal Admin field configuration or universal settings history.
Runtime dependency installation was explicit: the existing local startup
script does not automatically reinstall an already-present dependency volume
when package-lock changes; future dependency updates must install that lock.

Ignored raw evidence: root `.mobocom/admin-integration-evidence/`; private
fixture credentials must be removed at cleanup. Preserve unrelated older root,
`.serena/` and `public/demo/` owner work.

## Delivery checkpoint

Final source passed TS7, source2038/architecture/security/audit gates and the
production build after the last Audit change. All three maintained cases
passed again; the final four Audit captures remain scoped axe0/no overflow.
Cleanup verified zero owned users/roles/content/revisions/audits and restored
the exact original Journal raw setting by value claim. Private fixture auth
was removed. Existing Next output preserves its normal warnings; no release,
provider or deployment claim follows. Local commits stay on the branch above;
the owner has not requested a new PR for this task.
