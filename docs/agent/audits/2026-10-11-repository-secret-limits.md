# Repository secret limits — 2026-10-11

## Finding and owner

The canonical `src/modules/repository/server/http/public.ts` guarded machine license activation/check/deactivation and secret-capable release downloads with `rateLimitHit`. Its asynchronously mirrored count could admit a burst above the shared budget across app instances. The repository module/vendor switches already existed and remain authoritative.

The same `vendorGate` now awaits the existing platform `rateLimitStrict` for these two entry points. Existing 30/minute license and 60/minute download limits, per-IP key, URLs, response contracts and business/license validation remain. Machine secret routes share the strict budget; public discovery and ordinary human buyer limits retain the existing ordinary limiter. No new rate store, Admin setting, migration or dependency is introduced. Secret verification and ZIP delivery remain their existing owners.

`scripts/rate-limit.redis.cjs`, already invoked by `test:redis`, now invokes the actual repository HTTP owner through two independent limiter/KV module instances and real Redis connections. Vendor business methods are delegation spies, not a claim that this test verifies entitlement or real ZIP storage. Exactly 30 of 48 concurrent license requests and 60 of 80 concurrent download requests pass. Refused requests never reach delegates; malformed secret requests consume quota, the secret endpoints share the quota, discovery remains public, disabled module/vendor gates refuse first.

The existing strict limiter falls back to each instance's own count during Redis failure. This slice does not promise distributed quota enforcement during an outage or change the platform fallback policy. Existing Redis outage/expiry/atomic-count tests remain in the same gate.

## Executed evidence

- Final real Redis/HTTP gate: native exit 0, `.mobocom/restrictions-1791682580701-25900.log`. Both independent-instance quota checks, expiry, shared counts and outage-local enforcement passed. Fixture runner initially read the private Redis JSON with the wrong shape; the required-Redis assertion failed (`memory !== redis`), then its runner was corrected. This was not counted as a passing test.
- Deliberately restoring the old license gate admitted 48 instead of 30 and failed: `.mobocom/restrictions-1791682402621-9128.log`. Restoring the old download gate admitted 80 instead of 60 and failed: `.mobocom/restrictions-1791682403714-27848.log`. Exact original source restored; Redis gate passed again. Fault probes ran before build/check.
- Actual PostgreSQL current-account HTTP/form regression: native exit 0, `.mobocom/restrictions-1791682401255-33044.log`.
- Full `npm run check`: native exit 0, 638 tests pass, `.mobocom/restrictions-1791682408904-20112.log`. Production `npm run build`: native exit 0, 82 static pages, `.mobocom/restrictions-1791682408904-13700.log`; existing CSS compatibility warnings remain. This batch changes no React/CSS.
- Compiled HTTPS Chromium regression: 18 pass, 0 fail/skip/retry, 14.3 seconds, `.mobocom/restrictions-1791682666416-30020.log`. Existing real repository license/ZIP/wallet scenarios, ads, forms, global/current-account restrictions and security pass. Expected revoked-session error is exercised by the authentication-denial scenario, not an unhandled browser failure.
- Application source was final before check/build. After check, only Redis test assertions were strengthened to detect even an attempted disabled-owner store call and ensure distinct generated fixture IPs; the final actual Redis gate exercised these refinements. Source/diff whitespace gate passed. No broad full-browser suite is claimed for this batch.

Commands ran in the owned no-`.env` PostgreSQL/Redis fixture as uid 1000; no unrelated Redis namespace was cleared. No hosted workflow, push, PR, merge or user :3000 rollout occurred. Source remains on the fresh-main foundation branch; pending consolidated rollout is tracked separately.

## Following source-confirmed restriction gap

Historical handoff below is superseded by [the Import execution authority slice](2026-10-11-import-execution-authority.md); retain its source audit, do not keep reporting the addressed creator-only worker as current behavior on the foundation branch.

Precise source inspection of `imports/server/http/routes.ts`, `service.ts`, `commands.ts`, `execution.ts`, `registry.ts` and `operations/server/queue.ts` establishes the next actor-policy work:

- HTTP start/resume/rollback requires the existing `imports.manage` Admin guard, but services/commands do not persist the initiating operator for execution; background context and completion audit use immutable upload `createdById/createdByEmail`.
- `runSlice` claims the existing job and checks its status before each record, but does not refresh the actor's standing, global authentication restrictions or current authorization. A queued task can therefore outlive the actor authority assumed when it was scheduled. This is source evidence, not an executed exploitation result.
- `rollbackSlice` is an explicit repair command but likewise has no persisted executing operator or current actor decision. Recovery must have a narrow, explicit policy; blanket use of the original creator's standing must not prevent an authorized operator repairing another person's import.
- `scripts/imports.integration.cjs` already exercises real upload, dry run, dispatch, pause/resume, rollback and conflict preservation; reuse it. Its access case rejects a settings-only manager before upload, but it does not revoke/change the executing actor after queueing. Existing functionality is present; this is an authority coverage gap, not a missing import engine.
- Preserve uploaded provenance, cursor, per-record changes, rollback conflicts and existing permission keys. Extend these owners; do not reinterpret system notifications/financial obligations as user-acting jobs. Assess safe pause/rollback continuation and scheduler behavior before enabling global Admin restriction mutations. This gap is PARTIAL, not implemented by the rate-limit correction.
