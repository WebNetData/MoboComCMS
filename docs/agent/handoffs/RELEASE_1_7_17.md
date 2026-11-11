# Release 1.7.17

The owner asked to release the merged work after 1.7.16 (2026-11-11). This PR prepares metadata only: the version (`package.json`, `package-lock.json`), the seal of four additive migrations in `prisma/release-manifest.json`, the guides and the notes in `docs/releases/1.7.17.md`. No runtime source, dependency or shipped SQL changed. The owner merges this PR, builds and signs the package with the offline publisher key, and publishes the release. No deployment is part of preparation, and Guest Cache stays off.

Base main: `78aeba10` (the owner merged PR428–435 after v1.7.16 `c66753c5`).

Sealed migrations: `20270302120000_found_subtitles`, `20270303120000_cinema_people_names` (additive columns plus a data step that moves titles from an English-named copy of a cinema genre, country or language entry to the entry carrying that English name), `20270304120000_player_breaks` and `20270305120000_ai_answer_cache`. All are additive or data-preserving.

Owner action before this update: the disk-space protections (PR431) live in the new updater scripts. An update runs the installed scripts, so 1.7.16 → 1.7.17 still runs the old updater. Free space by hand once, as described in the notes and in `HOST_INSTALL_UPGRADE.md`. If Google sign-in goes through the proxy and the proxy page warns about an old builder, run `xray-install.sh` once (PR429).

Evidence: each PR's own executed checks, recorded in its description and handoff (connected PostgreSQL scenarios with deliberate breaks, unit files, browser and axe at 1440 light/dark and 390 for UI). For this metadata PR, `release:migrations` passed locally (19 releases, 0 unreleased). The exact release-commit GitHub checks and build belong in the PR or release receipt and are not inferred here.

Not verified: `package-update.sh` by execution, a real ENOSPC on a real disk, the first update on the owner's server, paid AI providers, and subtitle reads from hosts whose signed links are bound to the viewer's IP.

Rollback: the retained code rollback of the signed updater. The added columns, table, index and settings stay. Database restoration is an explicit owner decision.
