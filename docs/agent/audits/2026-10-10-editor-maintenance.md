# Scoped development review — 2026-10-10

Reviewed HEAD `093967e` (`fix/editor-text-direction`); fetched main is `0e196a9`, which includes the merged PR #145. Scope: the editor/plugin-switch/section-maintenance batch after `55bce06` (78 changed files), not a fresh certification of the entire platform. Existing unrelated working-tree changes were preserved. No application code, live module settings or production content was changed by this review.

## Findings

### P1 — Autosave commits lossy legacy conversion without explicit acceptance

`src/components/editor/gutenberg/BlockEditorApp.tsx:89–93` schedules save after any dirty edit when the plugin is enabled, including a converted legacy document with dropped parts. The converter in `src/components/editor/gutenberg/legacy.ts` warns about inline images/tables/other unsupported content but omits them from the converted document. A small text edit can therefore persist the conversion after four seconds without clicking Save, contradicting the notice asking the author to review before saving. Original content is retained in revision history, but the current body can lose those parts.

Evidence: code-path review. The attempted live browser reproduction reached the admin page but stopped at MODULE DISABLED, so the autosave behavior was **not reproduced in the browser**. Do not treat that attempt as a passing editor E2E check. Require explicit acceptance of a lossy first conversion before autosave is permitted; retain the existing canonical document and revision services.

### P2 — Concurrent maintenance changes overwrite another section

`src/modules/site/server/maintenance.ts:28–33` reads the entire setting, changes one section and unconditionally writes the full value. Two requests starting from the same value overwrite each other even when changing different sections.

Evidence: real PostgreSQL reproduction calling the actual service against a temporary audit-owned schema. Concurrent Store/Music enables persisted Store=true, Music=false. The temporary schema was dropped; live settings were untouched. Serialize or compare-and-swap the existing settings row and retry the merge on conflict. Add a connected concurrent-save regression.

### P2 — Explicit block direction is overridden by paragraph autodirection

`src/modules/editor/domain/render.ts:119` puts the selected direction on a wrapper, while `rich-text.ts:167–170` independently adds a direction to each paragraph. Explicit LTR on a Persian text block renders `<div dir="ltr"><p dir="rtl">…</p></div>`, so the child overrides the author's choice.

Evidence: executed renderer reproduction. Define direction precedence across paragraph overrides, block choice and automatic inference, and exercise the same choice in both editor and public rendering.

### P2 — First-letter direction detection misclassifies Unicode characters

`src/modules/editor/domain/rich-text.ts:33–46` considers broad script ranges to be letters and excludes a range containing actual letters. Executed reproductions: Hebrew maqaf followed by `Hello` (`\u05beHello`) returns RTL although the first letter is Latin; Kurdish Arabic letter AE followed by `Hello` (`\u06d5Hello`) returns LTR although the first letter is Arabic-script. Use Unicode letter classification before deciding script/direction; add these cases to the existing suite.

## Checks actually executed

- Host editor suite: 12/12 passed.
- Host content-controls/account-security suites: 63/63 passed, but logged failed Prisma calls to the container-only PostgreSQL hostname. Their maintenance dependencies need isolation for a database-free unit run.
- Container editor/content-controls/account-security suites: 75/75 passed with connected PostgreSQL.
- `npx tsc --noEmit`: passed.
- Connected `run-pg-checks.cjs editor-page-documents`: passed.
- Temporary-schema PostgreSQL maintenance concurrency reproduction: confirmed the lost update.
- Renderer/direction reproductions: confirmed the reported output.
- Live Edge browser: admin route loaded; editor test failed waiting for its input because the block-editor module is currently disabled. Owned user/page/revision/audit fixtures were cleaned.
- Observed GitHub PR #145 checks: npm check, PostgreSQL/Redis, production build and E2E all green. These are CI results, not local full-gate executions.

Full local release gates, all domain integration suites, production migration execution, protected-surface visual comparison and enabled-editor browser checks were not performed in this scoped review. The earlier GOOD rows are narrowed below to reflect the confirmed gaps; unrelated capability rows are not re-certified.

## Follow-up implementation — 2026-10-10

The owner requested fixes. Working branch: `fix/editor-maintenance-safety`, based on fetched `origin/main` `0e196a9`; the earlier findings above are historical, not unresolved defects after this batch.

- Legacy conversion stays pending through edits until the explicit first save. Lossy conversion labels that save as acceptance; ordinary autosave resumes after success. Browser checks retain the actual sanitised legacy body, then exercise manual conversion and resumed autosave.
- Maintenance writes claim the exact Setting value and retry a fresh merge after contention, including concurrent first creation and separate fields of the same section. Malformed stored JSON or failed reads cannot silently overwrite from a fallback. No new setting, permission, URL, API shape or migration.
- `resolveTextDirection` shares paragraph choice → containing block choice → automatic inference across the public renderer and editor decorations. Inspector changes refresh presentation without rewriting stored paragraphs. Only Unicode letters participate in inference; the reported Hebrew/Kurdish cases are covered.
- Visual review also found white editor surfaces under inherited dark-theme text. Editor chrome and engine panels now consume existing MoboCom semantic tokens. Real browser checks cover normal text contrast ≥4.5 in both themes, the empty inspector's dark surface and 390px overflow.
- Updated existing editor/reference architecture and decisions, repo-local `mobocom-audit`/`mobocom-develop` and installed `mobocom-audit`/`mobocom-develop`/`mobocom-engineer`. Kept the skill changes scoped; all five skill entrypoints passed the skill validator.

Executed follow-up checks: 76 focused unit tests passed (including Linux non-root); connected PostgreSQL `editor-page-documents` and new registered `section-maintenance` passed, also as non-root; TypeScript, architecture boundaries and source syntax/import checks passed; two enabled-editor browser regressions passed with real PostgreSQL and Edge. Desktop light/dark and mobile screenshots were inspected. The local plugin switch was restored after each browser run; namespaced pages, users, revisions and audit fixtures were cleaned.

Regression strength was checked by deliberately removing each protection in the development container, then restoring the original file: maintenance claim, Unicode-letter filter and block-direction propagation each caused the relevant test to fail. Removing the pending-conversion autosave guard caused the browser test to observe `blocks-v1` where `legacy` was required. After restoration the fixed browser checks and PostgreSQL checks passed again.

This batch did not run the entire release/build/E2E stack or production integrations. Unrelated user changes remain outside the fix scope. Current follow-up priorities are in [remaining gaps](../REMAINING_GAPS.md).
