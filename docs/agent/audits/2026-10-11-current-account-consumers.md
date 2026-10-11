# Current account checks at former raw-token consumers

## Source-confirmed gap and implementation

Continue fresh-main branch `feat/autonomous-foundation-2026-10-10` after `04561a9`. Ads/promo and repository/public resolved account actions from raw JWT uid; form submission also stored that uid. They bypassed current standing/password reset and the new GLOBAL authentication facts. Extend their existing identity adapters to `requireUser`; no new resolver, role/permission, URL, schema, migration, setting, document format or visual design.

The existing owning module still checks availability, ownership, ordinary request budgets and Origin. Account-sensitive advertiser reads/buy/update/image upload and owner license reads/buy/release/download now reject a denied identity before reaching their owner. Authentication database errors propagate; they are never converted into an anonymous write. Valid forum MODULE facts do not block these unrelated sections.

Form behavior follows existing Admin `requireLogin`: valid accounts retain attribution, login-required submission rejects stale/denied identity, public anonymous forms remain available with userId=null. Anonymous serving also loses account VIP rather than authenticating an old uid. This is explicit public anonymous behavior, not a new recovery bypass. Source scan now finds no direct raw-token consumer outside canonical `requireUser`; the existing `src/lib/api.ts` compatibility re-export remains.

## Verified evidence

Owned disposable PostgreSQL/Redis fixture, uid1000, no repository `.env`; application source is the isolated delivery worktree, not the root's older :3000 runtime.

| Executed gate | Result / ignored raw log |
| --- | --- |
| Focused existing units |47 passed: ads/forms/repository/account-security; `restrictions-1791680923386-37744.log` |
| Connected PostgreSQL | current-account-consumers, global-authentication, scoped-restrictions, forum-staff-sanctions all passed; `restrictions-1791680973905-37488.log` |
| Three actual old defects | Restore old raw-token behavior separately in each consumer: all three failed the connected gate; exact bytes restored; `restrictions-1791680971603-19680.log` |
| Application check | Native exit0,638 tests and architecture/source/schema/manifest/security/type gates; `restrictions-1791680977077-16508.log` |
| Production build | Native exit0,82 static pages; existing CSS warnings retained; `restrictions-1791680977078-5324.log` |
| Final compiled HTTPS browser |18 passed,0 failures/skips/retries in12.7s: actual account-consumer scenario and existing ads/forms/repository/global-authentication/security; `restrictions-1791681715282-29872.log` |
| Final type/source after test refinement | Native exit0,1735 TS/TSX files; `restrictions-1791681809751-12524.log`, `restrictions-1791681809747-34068.log` |
| Review | Scoped whitespace and exact feature diff reviewed |

Connected evidence uses actual HTTP/authentication/form owners, PostgreSQL rows and signed-cookie decoding; money, image and file delegates are spies proving denial happens before invocation. Forms really persist. It covers eight account operations, MODULE/GLOBAL isolation and revoke, BANNED standing, password-reset stale cookies, required/public form attribution and storage outage without delegate calls or anonymous fail-open. It does not claim real provider or payment correctness from those spies.

The compiled browser has no endpoint mocks. Existing Admin APIs create a namespaced product, validated ZIP release, encrypted granted license and both form types. It downloads real ZIP bytes before restriction and after individual revoke, rejects eight requests while restricted, compares license/product download/wallet account/ledger snapshots, proves actual form rows and unchanged required-form count, current standing/password reset, and a public homepage200 without page errors. Prepared extension/vendor setting rows are restored exactly with claims; vendor cache invalidation uses its existing Admin owner. Owned files/rows are cleaned. A normally generated fixture repository signing identity is retained, not reset.

## Failures and test isolation repair

Initial connected setup omitted required successText and one availability delegate; corrected the fixtures, not the form validator or vendor gate. The first browser attempt used the wrong wallet model name: fixed it to the real WalletTx/WalletAccount. Its companion repository revocation case also failed during the crowded same-address run; subsequent isolated consumer traffic passed that case. Do not count that initial14-pass/2-failure/2-not-run run as success.

The next run had16 passes, one buyer failure and one not-run: expected free-product409 became429. Actual owned Redis observation showed the reused seeded administrator's hourly buy counter12 against limit10 (108115ms remaining); `restrictions-1791681550456-14196.log`. The old test funded that shared administrator and a60-second sleep did not isolate an hourly budget. Refactored only the scenario to a fresh CUSTOMER, owned wallet, signed cookie and independent client address; namespace cleanup in finally and an explicit disposable-fixture guard. The administrator still performs product management but its balance, ledger and buyer quota are not used. Real limits and all financial assertions stay intact.

Removing that sleep exposed the final guest authorization assertion sharing the preceding client's one-minute address budget (429 instead of401). Give that fixture guest its own address. The intervening17-pass/one-failure run is retained; final18 passed without retries or sleeps. Application check/build predate these test-only refinements; final TypeScript/source checks and compiled browser followed them. No final full-suite run is claimed.

## Current maturity and next real work

These three current-account consumers have bounded functional evidence. Broader global restrictions remain PARTIAL: global Admin issue/history/revoke, other resource/contextual/real-time consumers, recovery exceptions and user-acting background policy are not complete. `operations/server/queue.ts` delegates `imports.run`/`imports.rollback`; `imports/server/execution.ts::runSlice` constructs actor context from ImportJob.createdById/email and checks job status per record. Inspect current actor authority before enabling global Admin commands; preserve stored provenance, progress and repair/refund obligations. This source discovery is not a completed background denial test. Other queue handlers primarily deliver system events/maintenance; do not blanket-cancel them from a recipient UserId.

An additional source-confirmed security-floor follow-up is the repository's secret license/check/download gate still using `rateLimitHit` rather than the required `rateLimitStrict`. Preserve public catalog and client compatibility while correcting the secret guard in its existing owner. Do not misclassify legitimate429 as broken authentication or raise limits to pass tests.

No global/consumer authentication source was overlaid onto the older root schema/client or :3000 app. Safe integrated main/schema/client rollout remains required. No Actions, push, new PR or merge. Protected owner files and existing root changes remain intact; the Goal stays active. No token savings or whole-platform/provider certification claim.
