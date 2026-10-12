# Analytics integrity — 2026-10-11

Bounded continuation from owner-merged main `8a3bc9f`; not production certification.

## Audited gap and repair

The existing collector created a visitor and caught every insertion failure as a
duplicate, then updated aggregates independently. Twenty-four same-visitor
requests reproduced 23 native duplicate-constraint errors. A failed aggregate
write could leave the visitor marker behind and silently lose first-visit counts.
Valid JSON `null` also crashed the collection HTTP handler.

The existing Analytics owner now uses parameterized, targeted conflict inserts
in one database batch. Its first daily aggregate write serializes concurrent
writers before conditional visitor/dimension increments; the visitor marker is
inserted last. Any storage failure rolls back all counts and the marker. Search
dimensions are also atomic. HTTP and fire-and-forget search retain best-effort
behavior, with a minimal observable failure event excluding search text, IP,
payload, error message and private paths. Non-object JSON is acknowledged without
collection. No migration, counting-rule change, reset, setting, new service or UI
redesign was introduced. Daily visitor hashing, retention and module-off guards
remain in the canonical owners.

## Executed local evidence

- `node scripts/run-pg-checks.cjs analytics-integrity database-insert-compat search-facets`:
  all three passed against owned PostgreSQL fixtures, non-root and without `.env`.
  The first attempt lacked a baseline test file in the reused container; that
  setup defect was corrected and the complete selected command passed.
- The same analytics connected test passed on a fresh SQLite schema and generated
  isolated client, leaving the PostgreSQL client untouched. Both databases cover
  24 concurrent duplicate visits, 24 distinct visitors over six paths, historical
  aggregates, rotating hashes, zero ordinary duplicate errors, real NOT NULL
  failure/rollback/retry, search and actual HTTP handler behavior.
- SQLite interactive callbacks initially failed with P1008, including after the
  canonical WAL/busy-timeout initialization. Database batches resolved the failure;
  no global connection configuration or timeouts were altered.
- `node --test scripts/engagement.test.cjs`: 12 passed; the null-body case first
  reproduced its failure before the fix.
- Three deliberate source faults were detected: removed visitor eligibility,
  removed atomic batch, and rejected best-effort search. A connected green baseline
  preceded them; source bytes were restored in `finally`. An earlier attempt during
  a stopped database was invalid evidence and is not counted.
- `npm run check`: passed, 581 site + 53 connected + 4 backup tests (638 total),
  including architecture, source, schema, release, security and TypeScript gates.
- Final `npm run build:postgres`: passed with both source slices (native exit 0).
  Compiled-runtime complete browser suite: 58 passed, seven existing fixture skips,
  zero failures/retries, 3.4 minutes. The added case proved real Origin-bearing
  beacons, two persisted views/one visitor and non-object JSON204/no-store.
  An initial wrapper lacked the existing admin/delivery fixture configuration
  (27 passed, four failed, 30 skipped, four did not run); the canonical configured
  runner resolved those setup failures. Earlier probe failures from filtered
  request headers and unavailable Blob postData were corrected by allHeaders and
  persisted-path assertions; missing no-store on early responses was a real bug
  and was fixed before the final build/suite. Assertions/retries were not weakened.

Raw local reports are retained under ignored `.mobocom/restrictions-*.log`:
PG selected `1791664861023-37420`, SQLite `1791664847134-6264`,
units `1791664821510-40916`, valid deliberate probes `1791676416096-11520`,
full check `1791676418471-42312`.
Final combined check `1791677096958-16436`, final build `1791677239920-19868`.
Final browser `1791677894154-28180`; later selected PG `1791678315399-5804`.
Actual user-local app on :3000 was restarted after the bootstrap permission fix:
readiness200, independent Chromium homepage200/zero page errors and real invalid
JSON204/no-store (`1791678606926-41744`). The 1440px light homepage screenshot
was inspected; no presentation source changed. Aggregate before/after fingerprints
proved all five roles and nine accounts preserved without logging sensitive fields.
The root source graph was incrementally refreshed offline (25.088s, sampled peak
193,863,680 bytes, 1,730 files); status is current for that root checkout. This is
index overhead, not measured agent-token savings or proof of the delivery tree.

## Remaining scope

No hosted Actions or new PR was executed for this batch. Provider delivery,
notification deduplication, broader scoped access and the remaining roadmap are
still separate work. No throughput or token savings measurement is claimed.
