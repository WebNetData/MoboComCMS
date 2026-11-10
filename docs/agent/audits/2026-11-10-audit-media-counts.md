# Audit 2026-11-10 — category counts after a save (item 5)

Base: main `620472bc`. Branch `fix/audit-p1-media-counts-2026-11-10`. Environment: local `mobocom-app` (Node 22) + PostgreSQL.

## 5. Silent failure of category counts — P1 — **confirmed, fixed**

- **Where:**
  - `src/modules/media/server/admin.ts` line 108: `recountFor` used `recount(taxonomy).catch(() => undefined)`.
  - Called after revision restore, the recount helper, trash-restore, create/update, trash, delete and bulk status (7 sites).
  - The same swallow was in `src/modules/games/server/admin.ts` lines 195, 207 and 221 (bulk restore, author trash, bulk delete).
- **Cause:** every recount error vanished. A failed count left stale numbers on public category pages with no log and no retry.
- **Decision — which failure stops what:**
  - The main write is never stopped or undone. It committed before the count, in its own transaction, and term counts are derived data that a later recount corrects.
  - A failed count is now logged (`taxonomy.recount_failed`: taxonomy, operation, resource, id, error name/message) and retried by the existing operations queue.
  - A new kind `taxonomy.recount` is deduplicated per taxonomy and retried with the queue's own backoff and monitoring page. No new job engine or parallel counter.
  - If queueing fails too, `taxonomy.recount_unqueued` is logged. Admin › taxonomy «بازشماری» stays the manual repair.
- **Change:**
  - `recountAfterWrite` in the taxonomy owner (`taxonomy/server/taxonomy.ts`);
  - `taxonomy.recount` in `operations/domain/job-kinds.ts` and its handler in `operations/server/queue.ts`. The handler validates the taxonomy and runs the same `recount`.
  - Media's `recountFor` passes `{ type, operation, id }`; games passes the batch ids.
- **Tests run:**
  - `scripts/taxonomy.test.cjs` (new case): a recount forced to fail on reading assignments is logged with exact fields and queued with the dedupe key; queue failure gives `lost` plus a log; success gives `counted`. Static guards: no `.catch(() => undefined)` around a recount in media or games, 7 media sites labelled, job kind and handler present. **7/7.**
  - `scripts/taxonomy-recount.connected.cjs` (native PostgreSQL, real queue `runQueue` and real handler):
    - a term stored with a wrong count is repaired by the job (status DONE);
    - a job naming an invalid taxonomy fails with "Invalid taxonomy" instead of DONE;
    - the helper counts on the real database;
    - other terms' counts are restored and owned rows removed. **Passed.**
  - `scripts/media-admin.test.cjs` + taxonomy: 41/41. Scoped `tsc` (5 files): exit 0. `check-architecture.mjs`: OK.
  - `npm run test:site`: 978 pass, 51 fail, every failure in the base's 53 environment set. The container also had PR #419's files.
- **Effect elsewhere:** only media and games admin writes. Public pages read stored counts as before. The queue gains one kind (label «بازشماری تعداد موارد دسته‌بندی‌ها»).
- **Registered:** `taxonomy-recount` in `scripts/run-pg-checks.cjs`.
