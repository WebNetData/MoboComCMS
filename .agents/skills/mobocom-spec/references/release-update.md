# Production Release, Update & Migration Reference

Load this reference for deployment, updater, schema migration, plugin/module updates or live-site maintenance.

## Goals
- deploy frequently
- preserve data
- detect incompatible extensions before update
- keep app rollback feasible
- avoid long maintenance windows
- make failures visible

## Release gates

Before public release/update, verify relevant:
- source/type/lint/static checks
- unit/integration tests
- critical E2E
- authorization/security checks
- production build
- migration status
- backup/restore readiness
- plugin/module/theme compatibility
- environment preflight

## Migration policy

Use expand/contract.

Avoid:
- same-release destructive rename/drop without compatibility bridge;
- huge blocking backfills inside request startup;
- assuming `down` migration can restore destroyed information.

For large backfills:
- batch work;
- checkpoint progress;
- make it restartable/idempotent;
- expose status.

## Update sequence

Conceptually:
1. put update lock if required;
2. preflight;
3. verify backup/snapshot;
4. stage artifact;
5. verify integrity/compatibility;
6. deploy compatible application;
7. run migrations/backfills as designed;
8. health/smoke tests;
9. activate new feature flags;
10. clear lock.

Exact order can differ by migration strategy; do not blindly run migrations before code if compatibility requires the opposite.

## Rollback

Prefer in this order:
1. disable new feature flag;
2. disable problematic plugin/module if safe;
3. rollback app artifact while DB remains backward compatible;
4. targeted data repair;
5. full restore only when necessary.

## Extension updates

Before plugin/theme/module update:
- check platform/Extension API compatibility;
- dependency graph;
- migration plan;
- settings schema compatibility;
- data retention/uninstall rules.

## Live development principle

Production must not become the experimental environment.
Use dev/staging when possible, feature flags for controlled activation, and production-safe migration techniques.
