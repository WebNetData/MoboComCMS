# Visual site studio — 2026-11-07

## PR369 check repair after the owner's main merge

Owner requested repair of failed Checks on head `6490d420` (main `d7d4a23a`
was merged by the owner). Hosted run42352662805 had a successful production
build; `npm run check` stopped at translation audit and PostgreSQL had six failures.

- Rename six local `t` arrow bindings to tool/template/tag through their actual
  Babel bindings. The translation auditor no longer mistakes local properties
  for dictionary keys. No dictionary allowlist/suppression, JSX copy, layout,
  permission or application behavior changed.
- CI provisions `mobocom_ci_test` consistently in service, health check and URL.
  The four disposable-database guards stay intact. Mini App assertions inspect
  their own namespaced live/draft/future/group fixtures while allowing valid
  first-deploy seeded content. Cinema/music/billing tests use the existing common
  source loader, including relative owner imports. The example-install fixture
  includes the real knowledge generator and integrity-checked shipped bundle.
- Existing permission inventory explicitly accounts for the generated read-only
  knowledge reference and the Magazine-only builder target selector, with a
  mapping assertion. Brand/avatar tests follow the extracted AccountShell and
  also assert that the actual dashboard layout mounts it. Article checks retain
  canonical style and retired-layout protections while accepting the explicitly
  requested generation1 layouts. No runtime access or privacy assertion was removed.
- Local UID1000/no dotenv: all six originally failing PostgreSQL suites passed
  against a separately migrated and seeded174-migration database. One complete
  check exposed seven later unit failures; those seven alone passed after the
  fixture/owner corrections, alongside the941 already passing cases (948 total).
  Remaining connected53, backup4, billing13 and TypeScript steps passed; successful
  steps were not repeated. Architecture/source/schema/money/security/audit/i18n
  gates passed. Doctor0 errors/four existing warnings; offline Zizmor0 reported
  findings with its two existing suppressions. No new browser run was needed for
  binding-only renames; the original feature browser evidence below remains scoped.

The repair changes CI/test compatibility and local variable names. No new schema,
dependency, production deployment, provider call or feature redesign. Hosted
checks for the repair commit are recorded in the local workstate after pushing.

Branch `feat/visual-site-studio-2026-11-07`, independently based on owner-merged
PR367/main `6e6f58b9`; no dependency on the separate AI engineering PR368.
[Scenario](../../specs/visual-site-studio/SPEC.md),
[operator guide](../../VISUAL-STUDIO-FA.md).

## Existing owners extended

Site owns BuilderDoc v2, BuilderRenderer, ThemeIndex, the global kit, reusable
templates, live feeds and ContentRevision. No new editor engine, settings store,
identity, package dependency or migration. `/admin/design-studio` joins the
existing page-builder manifest/nav and links the original theme conditions,
individual content targets and fullscreen editor. Existing style/effect controls
remain bounded and optional. Fixed preview viewports (1440/820/390) fit by zoom.

`surface` joins the existing theme metadata/index for movie, series, track, album,
game, software, member home and account body frame. Surface is immutable when
editing metadata. Closed current-entry fields and dashboard-part enums cannot
query arbitrary data. Exact entry rules beat general rules; account/member home
only allow the general rule. Specialist owners mount the presentation adapter
after their own gates and supply the real content/actions; missing content slots
fall back to the owner content. AccountShell retains authentication/navigation;
the shared account frame wraps the original route body. Member-home composition
extracts marked React nodes from the original overview owner, which still fetches
only `/api/my/overview` for its current member. No user snapshots in templates.

The latest owner request explicitly restores new article-template authoring.
New single-post templates carry generation1; legacy records cannot gain that
marker through metadata PATCH and remain inactive. Saving a direct post design
explicitly marks it designVersion1. Empty designs fall back to the normal style.
The canonical article/page block document, money rows and private media are
untouched. Existing URLs/default public designs remain until explicit selection,
publication or direct-entry save.

Live-preview draft writes are serialized in the client. Same-origin/window/page
messages refresh the dynamic server tree without navigating the frame. A pending
refresh survives late bridge readiness, including fast edits during hydration.
Drafts remain shared per page as before; this is not actor-private collaboration.
GET returns a revision from the same stored row as its document. The editor sends
that revision on save; exact Setting-value claims reject concurrent overwrites.
Document/history/strict audit commit atomically. A successful save clears only
the exact matching draft. Older clients can still omit the optional revision.
Template metadata edits send expectedUpdatedAt and return409 on stale edits.

Optional AI purpose `builder` inherits the Admin route and supports the existing
personal Admin context. Only instruction and a schema example are sent; current
page/member content is not automatically included. The endpoint uses canonical
permissions, Origin policy, module gates and strict8/10-minute rate limits. At
most8 sections/48 allowlisted widgets, canonical parsing and sanitization; no
generated executable code. Proposal audit has no document/publication write.
Applying a proposal changes local undoable state only and rejects stale bases.

## Scope and rollback

This is the native MoboCom visual/theme system, not WordPress/Elementor addon
compatibility or parity with every external widget. Account forms/auth/payment
internals remain owner components. No arbitrary private data/expression binding,
server code, executable theme installation or autonomous AI publishing.
Provider output quality/quota is not established by local synthetic responses.

Unpublish a template or disable page-builder to restore defaults while retaining
stored designs; existing document history restores earlier designs. Direct post
designs take precedence over chosen/global templates until their sections are
cleared and saved. Code downgrade should retain Settings/history; these changes
need no database rollback. No production build/release/deploy or real provider
account is part of this feature PR. Owner merges and deploys.

## Evidence

Focused builder35 units, full TypeScript, native visual-studio PostgreSQL,
existing builder-history and editor-groups-experts checks passed. The native
suite covers concurrent revision claims, strict audit rollback/history, newer
draft preservation, legacy/new post behavior, surface conditions/duplication,
module-off and exact permissions/Origin/proposal-only AI. It is registered in
`run-pg-checks.cjs` and runs as UID1000 without dotenv. The owned database applied
all173 migrations from empty. Final browser/scanner/fault receipts are recorded
below after completion; no pending assertion is a pass.

### Final local receipts

- Builder35 cases;69 AI/editor/picker cases;122 content/import/paywall cases.
  Two static assertions were redirected to their unchanged detail-view owners
  and the failing assertions alone passed afterward.
- Native PostgreSQL visual-studio, existing builder-history and
  editor-groups-experts passed as UID1000/no dotenv. Exact public media sample
  returns only identity fields and rejects wrong kind, draft and private audience.
  Deliberate removal of revision checking and broadening the AI permission to
  cms.pages were both detected; exact original source restored and passed.
- Actual Edge: hub creates private dashboard draft; live editing preserves frame
  window/scroll; selection/undo/redo/save/reload and1440/820/390 viewports; one
  synthetic AI proposal changes only local state. AI endpoint itself was tested
  through real identity/permission/database/audit owners with only model transport
  doubled; no real provider account/quota/quality claim.
- Published dashboard/account frame: two separate current members each saw only
  their own overview/name and retained wallet content. Specific post template
  retained canonical body; unpublish restored default. Specific movie kept owner
  body and did not affect series. Independent header/footer and specific product
  condition rendered around real owner content. Purchase/payment was not executed.
- Four loaded light/dark1440/390 hub views have scoped axe0 and no horizontal
  overflow; loaded editor scope axe0 after correcting the unsaved-marker contrast.
  Editor1440/390, public movie/product, member views and final private template
  banner were observed. [Review images](../../specs/visual-site-studio/evidence/).
- Full generated-route TypeScript, source/import, architecture, extension manifest,
  schema parity, migration manifest, security/audit gates passed. No schema change.
  React Doctor0 errors/104 reviewed warnings (existing owner complexity/index keys,
  private same-origin preview iframe, control labels, dynamic anchors and async
  patterns); no blanket suppressions. Semgrep local rules found16 unchanged
  test source-loader/evaluation fixtures and one unchanged regex-fixture parser
  warning in editor.test (Node/TypeScript checks pass), no runtime findings;
  redacted Gitleaks0. Source graph refreshed offline with zero semantic tokens.
- Browser verification initially caught a lost refresh before bridge hydration;
  pending refresh/ready handshake fixes it. The task dev process also exceeded
  its disposable memory limit after hot rebuild; restarting only that process
  with6GiB container allowance completed verification. Original local app and
  PostgreSQL were preserved. These are development-preview observations, not
  production performance or full release-build evidence.

Final source hashes/cleanup receipt are kept in the ignored local
`.mobocom/visual-studio` task evidence. No production/release/hosted workflow.
