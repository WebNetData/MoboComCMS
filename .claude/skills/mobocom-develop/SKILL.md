---
name: mobocom-develop
description: Implement, debug, refactor, or review MoboCom frontend/backend features with low-context tooling and production-quality architecture. Use for day-to-day work across CMS, CRM, specialist modules, Admin, APIs, database, identity, permissions and integrations.
---

# Development workflow

1. Read root instructions and focused repo map.
2. Audit before adding; repository truth beats prompts.
3. Use the smallest context path:
   - exact → `trs search`
   - conceptual → Probe
   - architecture/relationships/impact candidates → local Graphify (DEVSTACK); confirm source and existing gates
   - references/symbol-aware edit → Serena
   - verbose command → `trs`
4. Prefer reuse → extend → refactor → consolidate; no parallel shared platform systems.
5. Maintain canonical module ownership and the single MoboCom Identity/UserId invariant.
6. Implement a vertical slice: data/domain → application → authorization/settings → API/UI → tests.
7. Keep presentation thin; business rules belong outside React/routes.
8. Admin-control legitimate configurable behavior; keep secrets out of normal settings.
9. Validate disabled-module behavior when relevant.
10. Frontend: Storybook for new component states, React Doctor review, Playwright CLI for real user flow, a11y/visual checks as relevant.
11. Backend: architecture gates, Hurl/Testcontainers/fast-check when they add evidence.
12. API contract changes: load `mobocom-contracts`.
13. Run narrow checks first; broader gates only when impact justifies them.
14. Review diff for unrelated changes, security, compatibility, data and visual regressions.
15. Report only actual changes/checks/risks.

Protected UI: Homepage, Magazine, Music, Cinema (Movies/TV Series), Games, Software, Store and Community are preserve-and-enhance.

Load references progressively; do not read every reference for every task.

Tooling integration: `docs/agent/DEVSTACK.md`. Use Context7 for a narrow installed-version API question, selected Vercel React/web skills for the affected frontend concern, and isolated Playwright MCP for exploration. Existing Playwright Test remains regression evidence. Run the scoped tool router, retain raw reports locally, and use Semgrep or Opengrep once per security concern. Review Knip candidates before removal; never bypass ownership/nonce/guards for generic optimization advice.

## This repository
Read `docs/agent/PLATFORM_DECISIONS.md` when the task touches access, staff, the forum or delivery. The rules that most often matter:
- **Access:** guard with the section's own permission (`requirePerm` / `adminGuard`); never accept `cms.posts` outside the magazine. A route that changes a user's role, status or password calls `accountChangeRefusal`. Staff standing and role change in the same write.
- **Section authors:** an author permission (`journal.author`, `cinema.author`, `music.author`, `games.author`, `software.author`) is taken only through `requireContentScope`, which holds the caller to the items they created; never add it beside a section permission in a plain `requirePerm`. An author's delete is a trash request (`content/domain/trash.ts`); only a manager deletes or restores. See PLATFORM_DECISIONS §4A.
- **Forum:** walk categories with `categoryTree` / `categoryFamily` / `categoryPath`; limit everything public with `visibleCategories(viewer)`; decide moderation with `inCategory` / `moderatesCategory`; compose follow, feed and reviews from identity, community and reviews. New forum styles are an appended block in `src/app/forum.css` under their own prefix.
- **Staff sanctions:** applying or clearing forum silence/suspension calls canonical `accountChangeRefusal(actor, targetId, { sensitive: true })` before the profile write. Retain the authenticated actor, existing `forum.moderate` guard and full-access/role hierarchy; forum-only sanctions do not change global User standing.
- **Public item pages** carry a `ManageBar` with the section's permission; shared admin editors honour `?edit=<id>`.
- **Taxonomies:** a new way of filing content is a new taxonomy with one kind of item (see PLATFORM_DECISIONS §6A); name it in every branch on the taxonomy, never rely on an `else`.
- **Evidence:** add `scripts/<name>.connected.cjs` (same functions as the page, several viewers, cleanup in `finally`), register it in `scripts/run-pg-checks.cjs`, then break each rule on purpose and see it fail (back the file up and copy it back). Unit tests go into a file already in `test:site`. Open visible changes in a browser at 1440 light/dark and 390.
- **Local site:** `docker compose -f docker-compose.local.yml`; restart the app container after every change. Host scripts reach PostgreSQL on `127.0.0.1:5435`.
- **Delivery:** branch from fresh `main`; the pull request targets `main`; do not merge. Leave the owner's four unstaged files (`.gitignore`, `next-env.d.ts`, `package.json`, `package-lock.json`) out of commits.
- **Security floor:** limits that guard a secret use `await rateLimitStrict(...)`; a mutating `/api` call from a test or script sends `Origin`; an inline `<script>` in a component takes `nonce` from the `x-nonce` request header, and nothing uses inline event handlers (`src/platform/http/{rate-limit,origin-policy,csp}.ts`).
- **Money rows:** change a state with `updateMany({ where: { id, status: <decided on> } })` and check the count; answer 409 when it is 0. The database refuses the rest (migration `20261216120000_money_state_rules`); a new state or wallet row type widens the constraint in a new migration.
- **Block editor:** content of pages and articles is a MoboCom document saved through `saveDocument` (`src/modules/editor/server/documents.ts`), checked on the server and saved against `updatedAt`. A new block is a definition in the registry (fields, parents, children, version, migrations) plus its case in `domain/render.ts`; it needs no editor component. Never store HTML from a browser; never import `@wordpress/*` outside `src/components/editor/gutenberg`.
- **One language:** do not add `…En` fields to forms. **Maintenance:** a section's public pages are closed by `/admin/maintenance`, enforced in `src/middleware.ts`; do not add a second switch.
- **Large files:** past a few hundred lines, split by concern into `<name>/<concern>.ts` behind the same address; tests that read source read all the parts.
- **Tests that travel:** no dependence on `.env`, on rows that happen to exist, on ids 1 and 2, or on being root; run unit tests in Linux as a non-root user before pushing (`docker run -u 1000:1000 …`).

## Content conversion, setting races and text direction
- A legacy-to-block conversion is committed only by an explicit first save; disclose omitted parts and label acceptance when conversion is lossy. Autosave resumes only after success. Test editing and waiting past autosave before accepting, then ordinary autosave afterward. Keep canonical documents and revisions.
- When changing one part of an aggregate Setting, claim the exact stored value and retry the merge on conflict, including first-row creation. Never write from cached/error-fallback data. Prove simultaneous changes to different sections and separate fields of one section against PostgreSQL.
- Reuse `resolveTextDirection`: explicit paragraph → explicit block → first Unicode letter → page default. Verify the inspector change in the live editor and public renderer, including Hebrew punctuation and Kurdish letters; preserve automatic mixed-language paragraphs and LTR code.
- Editor chrome uses existing semantic tokens for surfaces/text and engine controls; compare 1440 light/dark and 390 screenshots and verify readable contrast. See the repository editor architecture for the implemented contract.

## Platform mandate routing — 2026-10-10

Read current repository root instructions, then task-relevant sections of `docs/agent/ARCHITECTURE.md` and `PLATFORM_DECISIONS.md`. The canonical contracts, domain matrix and roadmap are linked there; read only the affected scope. If the repository is unavailable, use the fallback from `references/architecture.md` and do not infer current implementation from it.

Extend current guards/registries/owners for groups, scoped restrictions, operational lifecycle, module themes and contextual actions. UI visibility is never authorization. Preserve current permission keys, data, URLs, canonical documents and financial state claims. For frontend design use FRONTEND_QUALITY: existing tokens + SDS, installed React Doctor with telemetry off, then real browser/a11y evidence; do not equate a score with bug-free UX.

<!-- mobocom-business-skill:start -->
## Business experiences routing

When this workflow touches business/Trustpilot-style experiences, first read docs/agent/handoffs/BUSINESS_EXPERIENCES.md and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve its authoritative checkout; continue existing ItemReview versus SellerReview owners and recorded evidence. Missing files in another checkout do not justify a new system. Load only the pending slice; the handoff is the continuation source.
<!-- mobocom-business-skill:end -->
