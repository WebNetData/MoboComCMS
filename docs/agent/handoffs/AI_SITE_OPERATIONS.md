# Site operations assistant — 2026-11-09

Branch `feat/ai-site-operations-2026-11-09`, stacked on PR390 (AI Admin area); independent of PR391/392.
Owner asked for recurring errors summarised with probable cause and evidence, action through allowed
repairs, development continuing in the isolated environment with PRs, and production release only
after their approval (their earlier choice in AI_ENGINEERING). Owner merges/deploys.

## Boundary

- Read-only page `/admin/ai/site-operations` + `/api/admin/ai/site-operations` (`settings.manage`).
  No table, migration, scheduler, dependency or executable action.
- Sources already recorded by the site, last 7 days: in-process error ring (`metricsSnapshot`, resets
  on restart, per process), FAILED BackgroundJob, FAILED MailLog/SmsLog, FAILED AiInvocation.
- `domain/site-operations.ts`: sanitizes email/phone/IP/token-like values, folds ids/numbers/quoted
  values into a signature, groups, and maps signatures to a closed cause list (migration, database,
  Redis, disk, memory, proxy, AI service/credential, mail, SMS, network, stale client, concurrency,
  code). Failed AI calls always map to the AI service, never to a server repair.
- Actions: a settings link of the owning section, or a hand-off to the existing engineering page via
  the existing tab-local workspace brief, now with an optional validated `mode`
  (DEVELOP isolated fix + PR / REPAIR fixed server action / DIAGNOSE). Engineering keeps its own
  unlock, permissions, budget, fixed repair IDs and explicit approval for production.
- Optional AI summary: POST, same-origin, 10/10min, `operations` purpose, audited; the model only
  sees sanitized groups and may only reference known group ids; text is stripped of URLs/markup.

## Evidence (local)

- 86/86 `scripts/ai.test.cjs` incl. 2 new cases; full `tsc` clean (LF copy in preview container).
- Real API on the local database showed actual recent failures (AI provider 502s, mail switched off)
  plus seeded failed jobs/mail; causes and links were correct after fixing the AI→proxy misclassification.
- Browser (1440 dark / 390 light): groups, causes, actions, no overflow or page errors; hand-off
  navigated to engineering. The local Server Panel is off, so the prefilled mode could not be seen
  in the browser; covered by unit cases. Fixture removed.
- Not run: AI summary against a real provider, engineering hand-off on an unlocked server, e2e.
