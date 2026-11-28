# Payment regression matrix

Use the checks below as the starting point for each affected scenario. Add executable coverage for any affected case without evidence. Preserve existing supported flows. Use synthetic SMS, fake external recipients and isolated database(s).

| ID | Scenario | Expected result |
|---|---|---|
| AC-01 | Remove bank account with automatic verification, no pending obligations | Supported delete/archive transition succeeds; related configuration handled safely; historical records preserved; UI/API agree after reload |
| AC-02 | Remove account with pending payment | Explicit actionable block or documented drain lifecycle; pending reconciliation stays possible |
| AC-03 | Archive/remove account referenced by terminal and verification configuration | No orphan references; routing stops for new intents; unrelated account/source remains functional |
| AC-04 | Repeated/concurrent remove requests | Safe idempotent outcome or documented conflict; no partial state |
| AC-05 | Unauthorized or cross-tenant remove | Rejected; no state changes or sensitive data leakage |
| TM-01 | Active verified card not yet assigned to terminal | Authorized operator can discover eligibility and assign it through UI/API; unrelated tenant cannot |
| TM-02 | Assign, reload, checkout using verified card | Assignment persists; correct eligible card is offered for new payments and verification still works |
| TM-03 | Disable/unassign card | No new payment intents use it; existing pending ones follow documented reconciliation policy |
| TM-04 | Assignment of disabled/ineligible/foreign card | Server rejects with stable actionable error; UI reflects policy |
| TM-05 | Multiple terminals and cards | Changes scoped correctly; no unintended cross-terminal or cross-tenant effects |
| PAY-01 | Concurrent unique-amount requests in same matching scope | Atomic allocation; no ambiguous live intents; safe handling when capacity exhausted |
| PAY-02 | Correct amount and authenticated source with sufficient receiver identity/evidence | Exactly one eligible payment transitions as policy permits |
| PAY-03 | Wrong amount, wrong source/account, invalid or ambiguous SMS | No automatic credit; traceable review/rejection |
| PAY-04 | Duplicate, replayed, concurrent forwarded event | At most one financial effect per payment/event; stable state |
| PAY-05 | Expired intent, delayed SMS, reused amount | No incorrect assignment or credit; documented handling/review |
| PAY-06 | Failure during DB update, worker restart, callback retry (if applicable) | Atomic or recoverable state; no duplicate financial effects; retry-safe delivery |
| PAY-07 | Rial/toman or other unit conversions, parsing formats and boundary values | Exact amounts, explicit units, no rounding-induced false match |
| PAY-08 | Spoofed/untrusted forwarding request or insufficient source identity | Reject/quarantine; no automatic payment confirmation |
| REG-01 | Previously supported ordinary/manual and automatic card flows | Existing behavior preserved unless explicitly approved change |
| REG-02 | UI end-to-end management flow | Authorized operator sees actual state, actionable errors, assignment and removal results after reload |
| REG-03 | Existing API clients, migrations and upgrade fixtures | Contracts preserved or explicitly versioned; migration preserves data and documented recovery works |

## Checks in this repository

Run `npm run test:pay` on a migrated disposable PostgreSQL database with a name starting with `mobocom_pay_test_`, owned by a non-superuser. Run `npm run test:pg -- <check>` for a focused iteration. For the historical upgrade run `npm run test:pg -- pay-center-upgrade` on a different, empty Pay database. The existing manual CI workflow provisions both. `npm run check` includes `pay-routing.test.cjs`, `pay-bot.test.cjs`, `payments-sms.test.cjs`, `payments-mellat.test.cjs` and the billing unit suite.

| Scenarios | Existing evidence to start from | Coverage to establish when affected |
|---|---|---|
| AC-01–05 | `pay-bale-collection` checks protected collection history and distinct destination accounts. `pay-center-upgrade` verifies historical financial records. | The account disable/archive/remove commands and their UI, including an in-flight payment, concurrent requests and cross-tenant denial. |
| TM-01–05 | `pay-gateway-access` and `pay-routing-operations` exercise persisted terminal policy, eligible gateways, rotation/archiving behavior and routing fallback. `pay-terminal-keys` covers key ownership. | Full rendered assignment/disable/unassign flows, including refresh, multiple cards and the old pending checkout. |
| PAY-01–05, PAY-07–08 | `pay-bale-collection` exercises same-amount concurrency, account/source matching, early/late/replayed evidence, receipts and single wallet posting. It loads the bank SMS fixtures. `payments-sms.test.cjs` and `pay-usdt-equivalent` cover parsing and amount conversion. | Any newly affected parser, receiver scope, expiration or reuse window, plus endpoint authorization. |
| PAY-06, REG-01 | `pay-shared-checkout`, `pay-routing-operations`, `pay-webhooks`, `pay-settlement-center` and `pay-financial-period` cover retry, manual/automatic flows, once-only financial events, concurrent approval and reconciliation. | Real failure/restart at any newly changed commit or delivery boundary. |
| REG-02 | [Pay handoff](../../../../docs/agent/handoffs/MOBOCOM_PAY.md) records previously executed browser journeys. | Run the affected current Playwright flow with synthetic fixtures. Confirm saved state after reload, permission errors and accessibility. |
| REG-03 | `mobocom-pay`, `pay-bot`, `pay-private-api-access`, `pay-webhooks` and `pay-center-upgrade` exercise selected existing consumers, authorization and historical migration compatibility. | Changed client/contract and schema-specific upgrade/rollback behavior. |

For each selected test report command, expected result, actual result, and pass/fail/not-run. Add tests for additional supported callbacks, ledgers, refunds or other real features only if present. Full payment suite must be green before release; missing critical coverage is a blocker, not a pass.
