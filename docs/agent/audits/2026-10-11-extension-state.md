# Atomic extension state — 2026-10-11

## Existing owner and actual defect

extensions/server/state.ts remains the canonical owner behind generated manifests and the existing settings.manage Admin controls. Actual PostgreSQL baseline1791718574352-9748 reproduced concurrent seo.title loss. The previous mutation read/merged then unconditionally upserted; its legacy mirror was a separate write.

Save now uses a Serializable transaction with bounded twenty serialization/initial unique-conflict retries. Current settings, stored enabled flag and recursive dependency checks use that same transaction reader; state and legacy mirror commit or roll back together. Existing default/effective distinction, masked secret behavior, validation hooks, permission/URL and module data stay unchanged. No new lifecycle system, settings registry, migration, package or protected React/CSS change. Existing dependency fixture now models transaction rollback instead of missing transaction API.

## Executed evidence

Owned PostgreSQL fixture; non-root Node22, no .env, original Settings restored in finally. Raw logs retained under root .mobocom/restrictions-<id>.log.

- Final actual PG owner1791719302148-18952 and explicit one-connection/pool_timeout2 owner1791719302873-44332, native exit0. Two controlled writers before first upsert, existing and absent row retain both fields. Injected mirror exception rolls back exact two-row snapshot; invalid field refused. Actual dependency owner checks reject dependent activation under disabled VPN, retain stored RemnaWave enabled while effective-off/settings saved, restore effective activation with parent, reject disabling parent while dependent enabled, permit after dependent deactivation. These are fixture state changes only; no provider traffic or functionality expansion of set-aside modules. Native server-plugin registry boundary is empty: Store has no server validator; provider validator certification is not claimed.
- Two source faults detected/restored: ReadCommitted isolation1791719072835-45832 loses title; external db writes1791719073399-45880 leave changed state after injected mirror failure. Meaningful assertions inspected; normal/single PG owners rerun after restoration.
- Final full check638 (581+53+4), native exit0:1791719108365-28084. Production build native exit0:1791718671272-18772, existing CSS warnings retained. Final standalone TypeScript native0:1791719058085-29092. Only test fixtures changed after build, not application source.
- Compiled HTTPS browser24 pass, zero fail/skip/retry,29.5s:1791719075765-5932. New real sections HTTP consumer concurrently stores distinct fields, reads both through existing Admin API, refuses visitor and renders the existing section address. Native test forces the race; HTTP concurrency is not claimed as a controlled scheduling proof. Existing Telegram/Global Admin/current-account/checkout/security and Admin light/dark/mobile/a11y regressions included. No React component changed; no new React Doctor scan claimed.
- Earlier full check1791718648022-45084 failed old mock's missing transaction;1791718942948-45180 failed new test's nonexistent guest fixture after units passed. Both retained, corrected in tests, and superseded by final actual native0 command; never counted as successes.

## Remaining scope

This proves bounded state/settings write integrity, not complete lifecycle or production readiness. Independent legacy flag writers, mixed read snapshots outside mutations, corrupt stored JSON fallback/write behavior, concurrent opposing dependency switches, package publication/compensation and queued effects still require their own evidence. Existing catalog price-drop handler already checks Store enabled, so generic dispatcher inspection is not proof that every queued effect bypasses modules. No production data, root source/client/:3000 or owner files touched; no Actions/push/PR/merge/deploy. Graph candidates are static, not runtime proof; no token savings claimed. Goal active.
