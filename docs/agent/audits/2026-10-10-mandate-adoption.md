# Platform mandate architecture/skill adoption

Date: 2026-10-10. Branch: `fix/editor-maintenance-safety`, current working tree over main `0e196a9`. Scope: owner-requested architecture and existing skill updates. No runtime feature implementation, database change, activation, visual redesign, PR, merge or deployment in this batch. The prior editor/maintenance fix batch and unrelated local changes remain intact.

## Delivered

- Exact owner attachment archived once in `requirements/platform-mandate-2026-10-10.md`, SHA-256 `a833b5647836c5ae56e381d9ea92b42a9996eef199b5bee22a4a60ee5eafee8b`; provenance records byte length and source. Git `-text` protects its original CRLF bytes from checkout normalization.
- Existing canonical architecture and owner decisions expanded with lifecycle/Admin, independent themes, canonical groups/AuthZ, scoped restrictions, contextual actions and professional domain/shared-service contracts. The new contracts distinguish implemented owners from targets.
- Protected surfaces explicitly include current Community, Software and Store. Previous permission to redesign Forum is recorded as superseded. Existing role/section keys and Store catalog/order distinctions remain compatible; owner still merges/deploys.
- Domain matrix covers Platform Core and all seven requested domains across 21 dimensions, with evidence, real inspected gaps, uncertainty, priority/risk, dependencies and acceptance. Existing ledger remains the finding/evidence owner; no broad Functional/ProductionVerified/benchmark parity claim.
- Incremental roadmap prioritizes release evidence and scoped restriction foundations, then compatible shared foundations and domain maturity. ADR records alternatives, security/migration impact and reversibility.
- Canonical frontend workflow uses existing MoboCom visual tokens with SDS primitives/compositions, affected-file React Doctor, actual Playwright/a11y/light-dark/mobile/RTL evidence. Static diagnostics do not certify beauty or zero bugs.
- Six existing `.agents` workflows, six Claude mirrors, six installed workflows and installed `mobocom-engineer` updated (19 entrypoints). No new parallel domain skills. Repeated architecture/design/toolchain copies replaced with canonical routers; installed fallback is one shared secondary snapshot. Invocation metadata unchanged.
- `scripts/sync-mobocom-skills.cjs` performs reproducible mirror updates and opt-in existing-installed synchronization; `--check` detects drift. `scripts/check-engineering-docs.cjs` checks local routing, manifest frontmatter/reference integrity, matrix coverage/owners, original archive hash/attributes and mirror consistency. Added the integrity step to existing CI; did not change dependency files or claim GitHub CI ran.

## Source requirement traceability

Use this index to resolve requirements without loading 2,603 lines on every task. The archived mandate is source input; canonical contracts and repository evidence govern implementation.

| Source sections | Canonical adoption | Implementation coverage |
|---|---|---|
| 0–3 mission/repository/constitution/shape | ARCHITECTURE §§1–3, root guidance, ADR | Existing modular monolith and owners retained; no rewrite. |
| 4–6 modules/lifecycle/dynamic Admin | ARCHITECTURE §6; evolution contract §1 | Existing package/state/navigation inspected; advanced operation/contribution target remains incremental. |
| 7–8 independent themes/plugins | ARCHITECTURE §§10–12; evolution contracts §§1–2 | Global themes and extensions exist; independent module assignment is planned. |
| 9, 18–19 identity/groups/restrictions | ARCHITECTURE §15; evolution contracts §§3–4 | Canonical User/Role and forum groups/sanction timestamps exist; normalized advanced policy still target. |
| 10 Community | Evolution §6; matrix Community; roadmap 7 | Extend scoped category moderation and existing social owners, verify flows first. |
| 11 commerce | Evolution §6; matrix Store; roadmap 8 | Preserve catalog/financial owners and state claims; targeted audit before commerce additions. |
| 12–16 publishing/music/cinema/games/software | Evolution §6; corresponding domain matrix rows; roadmap 9–12 | Preserve existing documents/entities/version history/playlists/player; close only evidenced gaps. |
| 17 contextual administration | ARCHITECTURE §26; evolution §5; roadmap 6 | ManageBar/inline moderation reused; typed mutation contribution is a target. |
| 20 editor | ARCHITECTURE §7; evolution §6; `docs/editor/ARCHITECTURE.md` | Canonical document/adapters/revisions and prior conversion/direction fixes retained. |
| 21–24 shared services/relations/import/events | ARCHITECTURE §§9,16–21; evolution §6; roadmap 13 | Existing service owners, typed references and bounded jobs, not new systems. |
| 25–27 Admin/analytics/settings | ARCHITECTURE §§6,14,23,26; evolution §§1,6; FRONTEND_QUALITY | Existing Admin Control Plane, privacy/retention and real metrics requirements; completeness not presumed. |
| 28–31 security/data/upgrade/observability | Existing owner decisions; ARCHITECTURE §§2A,22–24; evolution contracts; release workflow | Prior nonce/Origin/limits/money constraints and incremental manifest migrations retained. |
| 32–35 maturity/matrix/ADRs/tests | DOMAIN_CAPABILITY_MATRIX; adoption ADR; contract acceptance/roadmap | Explicit evidence thresholds and real-test rules; no broad production claim. |
| 36–37 skills/hierarchy/coverage | MASTER_PROMPT; existing six scoped workflows plus engineer; skill sync | Root → canonical architecture → focused contract → domain owner → tests. Domain coverage reuses workflows/references. |
| 38–43 priorities/DoD/autonomy/safety/deliverables | IMPLEMENTATION_ROADMAP; ADR; this report | Architecture-adoption batch completed within user scope; future runtime slices stay pending. |

## Actually executed checks

| Check | Result / scope |
|---|---|
| Official `skill-creator/scripts/quick_validate.py` | PASS: all 19 repository/Claude/installed entrypoints. |
| `node scripts/check-engineering-docs.cjs` | PASS: canonical documents/routers, 8 × 21 dimension coverage, evidence paths, links/anchors, source hash and repo skill mirrors. |
| Same integrity gate in `node:22-alpine`, read-only repository mount, UID/GID `1000:1000` | PASS: Linux/Node 22 as non-root, no `.env` loader, database or installed-skill directory required. |
| `node scripts/sync-mobocom-skills.cjs --check --installed <home>/.codex/skills` | PASS: mirrored files and shared fallback synchronized after final update. |
| `node scripts/check-architecture.mjs` | PASS: architecture boundaries. |
| `node scripts/check-source.mjs` | PASS: syntax/import check of 1,733 TS/TSX files. |
| Python `yaml.safe_load` of `.github/workflows/checks.yml` | PASS: YAML parses; one integrity step in check job, all three jobs retained. This is local validation, not a GitHub CI result. |
| Local React Doctor `--help` and installed package version | PASS: installed 0.9.17, declared `^0.9.14`, documented flags available. No diagnostic scan or UI certification in this documentation batch. |
| `trs audit-docs` | Initially reported three root-rule duplicates; CLAUDE now routes to AGENTS. Final audit has no duplicate blocks. |
| `git check-attr text -- docs/agent/requirements/platform-mandate-2026-10-10.md` | PASS: text unset; preserves original byte hash across Git normalization. |
| Scoped `git diff --check` | PASS with CRLF-aware whitespace configuration. An initial per-command `autocrlf=false` check misclassified the workflow's existing CRLF endings as trailing whitespace; no source change or real trailing-space fix was needed. |

No new PostgreSQL/browser/full release/build tests ran for this adoption batch: no runtime/UI/schema was changed here. Earlier editor/maintenance tests are documented in their separate audit; they do not certify these planned platform contracts. Full CI and browser release gates remain required for an eventual PR.

## Next implementation

Use the roadmap and matrix, not a restart. First preserve and deliver the existing fix batch with required gates, then audit the narrow scoped-restriction migration/entry-point slice. Unassessed domain workflows need verification, not automatic recreation. The largest inspected foundation gaps are advanced shared group decisions, auditable independent restrictions, operational lifecycle recovery, per-module theme assignment and typed contextual mutation consumers.
