# Release 1.7.16

Owner requests release 1.7.16 and explicitly authorizes GitHub build. Production deployment remains the owner's action; Guest Cache remains off. Never merge the metadata PR without owner authorization.

Base main: `842d7bb1` (owner merged PR415–425). Its tree exactly equals validated integration `87b63304fc3c958f126989b6d7bd4672e546685c` / tree `9ea6ab40d6a989d9821723178f22a85bec950991`.

This release changes metadata/guides and seals the existing additive Google migration only. No runtime source, dependency version or shipped SQL is changed. The original publisher key stays offline; use the native signed mbrelease and installer, verify all downloads, preserve 1.7.15 assets/tag.

Integration evidence: 1109 tests/check gates, 202 default PostgreSQL scenarios, real Redis atomic/locking and runtime stop/recovery (0ms detection, 501ms recovery), operations alert recording double, production build run42883973626, 33 account assertions, real wallet/invoice/return flow and 11 maintained browser tests with zero retry/skip. Fourteen optional PostgreSQL scenarios were not selected. Exact release-commit GitHub checks/build results and artifact hashes are recorded in the metadata PR and release receipt, not inferred from this earlier integration.

Remaining limits: fallback is per process during Redis outage, no sustained multi-process/partition/cluster failover proof; actual Google OAuth and actual Telegram delivery unverified; existing dark Automation contrast tracked separately in issue426. No production env/TLS/PSP/backup restoration certification. See `docs/releases/1.7.16.md` and `AUDIT_PERFORMANCE_CONTINUATION.md`.

Rollback: use existing signed updater/retained code rollback; preserve additive Google columns, settings and stored data. Database restoration requires an explicit owner decision. Never activate balanced Guest Cache as part of release preparation.
