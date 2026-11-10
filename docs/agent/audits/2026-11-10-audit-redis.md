# Audit 2026-11-10 — Redis outage and multi-instance state (item 4)

Base: main `620472bc`. Branch `fix/audit-p1-redis-2026-11-10`. Environment: local `mobocom-app` (Node 22) + PostgreSQL. No Redis server in this environment.

## 4. Redis fallback and multi-instance consistency — P1 — **confirmed (partly), fixed**

### Findings
| Concern | Result |
| --- | --- |
| Fallback to `MemoryKv` when Redis is unreachable | **Confirmed problem.** A failure at start-up made the process use its own store until restart, even after Redis returned (`kv()` cached the first result for good). With several instances each then silently kept its own limits and sign-in state. Only one log line at start. |
| Strict rate limits during an outage | **Already safe, kept.** `rateLimitStrict` falls back to this process's count, so an outage never opens a limit. Several instances during an outage each enforce it on their own traffic (documented, not a hole). |
| Locks and one-time tickets (`kv.lock`) | **Fail-safe, kept.** The only security-sensitive users are the Google flow state and ticket. On the fallback a return that reaches another instance finds nothing and is refused, never accepted twice. With Redis, `SET NX` is atomic across instances. |
| Shared non-strict counting (`rateLimitHit`) | **Problem, fixed.** It decided once at module load whether Redis was there, so a Redis that answered later was never used. |
| Visibility | **Problem, fixed.** The monitoring page told the owner to "set REDIS_URL" even when it was set but unreachable. The operations monitor had no Redis signal. |

### Change
- `kv.ts`:
  - The process-wide state reconnects (5 s doubling to 1 min, timer unref'd) and switches to Redis when it answers. A failed attempt disconnects its client.
  - Logs `kv.redis_unavailable` once, then `kv.redis_fallback_active` at most every 5 min, and `kv.redis_recovered` on return.
  - New `kvHealth()` and `reconnectKv()`.
- `rate-limit.ts`: shared counting asks the current store each time.
- Monitoring: `cache.degraded/degradedSince/reconnectAttempts/lastError`. The checklist line reads «تنظیم شده ولی در دسترس نیست…» (styled `is-bad`).
- Operations monitor: `redis` signal. `warning` while degraded, using the existing Telegram alert and recovery message; `disabled` when not configured.
- One-server installs without `REDIS_URL` behave exactly as before.

### Tests run
- `scripts/scale.test.cjs` (9/9), new case with a fake ioredis server shared by two independently loaded instances:
  - down at start: fallback, `degraded` with error, logged once, reconnect scheduled; the strict limit stays closed;
  - Redis returns: both instances reconnect, `kv.redis_recovered` logged, and one limit is shared (the 4th hit refused whichever instance it reached);
  - Redis drops again: the strict limit stays closed and `rate_limit.shared_unavailable` is logged.
  - The existing outage test was adapted to the new state object.
- `scripts/redis-fallback-signal.connected.cjs` (native PostgreSQL, real kv, `REDIS_URL` at a closed port): the `redis` signal is `warning` naming the fallback and the real connection error; without `REDIS_URL` it is `disabled`. Registered in `run-pg-checks.cjs`.
- Scoped `tsc` (kv, rate-limit, monitoring server/page, operations monitor): exit 0. `check-architecture.mjs`: OK.
- `npm run test:site`: 979 pass, 51 fail, every failure in the base's 53 environment set.
- Live `/admin/monitoring` in the preview (no `REDIS_URL`) renders with 0 page errors and shows "not configured".

### Not run
- A real multi-instance test against a Redis server (`scripts/rate-limit.redis.cjs` needs a Redis 7 server; none runs here, and starting a new container was not authorized for this task). The fake server covers the logic; a real Redis run remains an operational check.
