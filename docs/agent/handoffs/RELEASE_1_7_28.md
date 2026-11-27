# Release 1.7.28 — 2026-11-28

Release checkout `.mobocom/release-1.7.28` on `release/1.7.28` uses merged
main `56b8fcf3`. This release includes PRs #516–#520. See the
[operator notes](../../releases/1.7.28.md), [AI management](AI_MANAGEMENT.md)
and [MoboCom Pay](MOBOCOM_PAY.md) for behavior and feature evidence.

The manifest seals the three additive migrations for AI reviews, Pay gateway
access and Pay terminal credentials. Rollback restores application code and
retains the added tables and records. Live provider and server rollout have
their own operational checks.
