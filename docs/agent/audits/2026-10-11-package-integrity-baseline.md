# Package integrity baseline — 2026-10-11

Previous turn committed c98f74a and supplied verified admission/Core recovery evidence. This turn inspected existing packages/server/store.ts and executed actual PostgreSQL reproductions before changing package architecture.

-1791725344996-35052: two intercepted completed SQL reads of the same package are released together; actual writePackageFile(a.txt) and writePackageFile(b.txt) both finish, but final a.txt is old-a instead of new-a. Whole stale package snapshots overwrite each other. Test expects both edits/history and fails.
-1791725345749-22740: actual package bytes/history save succeeds, then the controlled index upsert throws. Command rejects, but package bytes are must-rollback and a new revision is retained; expected original row assertion fails. No transactional package/index write.

Source also shows index read/modify/write, settings/enable/file/code updates and theme synchronization outside a unified transaction. Those additional concurrency paths remain source candidates, not separately proved runtime failures. Installation in both actual fixtures remains inactive. Real SQL is exercised; built-in collision catalogs/theme config are fixture doubles because this case concerns plugin persistence, not theme validation. Namespaced package rows and original index are restored in finally; no real filesystem, provider, production or root :3000 mutation.

Native failures are expected reproductions, not passing gates. The script is not registered until corrected. No application source changed, build/browser/full release stack not repeated. [Implementation contract](../../specs/package-integrity/SPEC.md). Continue incomplete batch; do not rebuild packages. Goal active, full lifecycle/audit/compensation/theme/group/domain/release scope remains open. No Actions/push/PR/merge/deploy/token-saving claim.
