# Dedicated Cloud customer workspace — 2026-11-26

Local feature slice on `feat/cloud-workspace-2026-11-26` in
`.mobocom/cloud-workspace`, base`e133b9a3`. Previous Pay/account commits and
other worktrees are preserved. Owner merges and deploys; implementation performed
no hosted workflow, release/tag/version update or production action. PR delivery
is recorded below.

## Pull request delivery — 2026-11-26

At the owner's explicit request, all four unmerged development commits through
`dd4594c7` were pushed on this branch and [PR #492](https://github.com/WebNetData/MoboComCMS/pull/492)
opened against `main` (`bac9e4aa`). This is a cumulative PR: Cloud workspace plus
the preceding Pay public/onboarding/Admin bank-source guides, guarded account
administration/erasure and section-subdomain work. The PR description records
the three unreleased account migrations and the already-executed local evidence.
No new product changes or repeated runtime checks were needed for delivery;
`git diff --check origin/main...HEAD` passed. This documentation delivery commit
also belongs to the PR. No merge, auto-merge, release/deploy or hosted workflow
dispatch was performed; the owner reviews and merges.

## Result and owners

- `/cloud/dashboard` has its own shell and typed ShellNav menu. Phone/tablet
  navigation uses a44px hamburger and native dialog: Escape/backdrop, focus
  containment/restoration, navigation/history close and desktop-resize cleanup.
- Hosting owns the overview/read API, service/domain lists and details, new-order
  wizard and customer actions. Existing endpoints and lifecycle owners are reused.
  Counts are real; CPU/RAM/disk mean allocated active-server plan capacity, never
  fabricated measured usage. Scoped SDS styles include loading/empty/error/retry.
- Current canonical Identity, fresh module/section-group/maintenance guards close
  the workspace. Guests return through Login. No second account or permission
  resolver exists. Wallet and Support remain their existing shared owners; the
  Cloud support route composes TicketCenter, without another inbox.
- `GET /api/hosting/workspace` is read-only, strict-rate-limited, private/no-store
  and noindex. It accepts only closed view/cursor parameters. Hosting's read
  projection constrains both Order.userId and Invoice.userId and matches exactly
  five literal Cloud kinds after JSON parsing. No raw meta/payment/provider error
  or action detail appears in the overview projection. Amounts use persisted minor
  values. Seek pages contain at most25 matches and scan at most1000 owned rows;
  sparse pages keep a continuation and do not falsely claim history is empty.
- Checkout's closed `cloud` surface accepts Hosting/domain purchases, renewals
  and add-ons only. It persists the marker through existing checkout and reuses
  invoice/payment/fulfilment effects. Canonical Invoice/Result pages are composed
  after Cloud ownership checks; store/cart/public/dashboard behavior is retained.
  Existing bank callback pages return Cloud orders into the private workspace.
- Old `/dashboard/cloud` and its list/wizard entry routes redirect compatibly;
  old generic service/domain detail routes still work. Account Cloud links point
  directly to the workspace. Public `/cloud`, `/hosting`, `/servers`,
  `/domains`, CloudLanding, CloudBar and public Cloud CSS source are unchanged.
  Public alias settings do not rename the private address. Section subdomains
  return private navigation to the canonical main origin. Private paths are
  excluded from analytics/search/page cache even with custom cache settings.
  Public PWA prompts no longer overlay this private workspace.

## Executed verification

Fresh221-migration PostgreSQL database with a dedicated NOSUPERUSER owner and
Linux UID1000, isolated from the existing app/data:

- `node scripts/run-pg-checks.cjs cloud-workspace dashboard-service-ordering hosting-services hosting-renewal hosting-addons hosting-domains`
  executed as two scoped batches; all six suites passed. Extended workspace and
  checkout checks were rerun after their final changes. Real DB owners prove
  guest/banned/module/group/maintenance access, exact metadata filtering,
  dual invoice/order ownership, API query rejection/private headers, seek paging,
  a1000-row sparse gap/continuation, safe activity, Cloud result ownership,
  closed checkout context, legacy behavior and wallet replay without recharging.
- Three intentional faults, only in the owned runtime, were caught: section-group
  guard removal, invoice classification removal, and financial classification
  removal. Originals were restored and the native suite passed again.
- `npm run check` passed without .env/DB/secrets in the nonroot runtime:
  architecture/source/schema/migration/money/security/audit/i18n gates,
  1144 site tests,53 connected tests,4 backup tests,14 Billing tests and types.
  Final focused `tsc --noEmit`,16 cart/checkout units and source checks cover
  subsequent strict metadata, error/loading components and presentation fixes.
- React Doctor ran on nine affected components, then on the five changed detail/
  financial/error/loading components, telemetry/supply-chain off, blocking error:
  zero errors. Final focused run has five reviewed warnings: complexity/duplicated
  existing domain UI and client-only date formatting. Detail effect cancellation
  and post-JSON unmount checks were fixed. Native dialog backdrop click is paired
  with native semantics/Escape/focus handling; no rule was suppressed.
- Scoped local Semgrep and redacted Gitleaks reported zero findings.
- Actual headless Edge/Playwright: overview1440/390 light/dark;25 distinct final
  views cover eleven routes at390 in both themes,1440 financial list,320 overview
  and empty owner. All have zero scoped axe violations, horizontal overflow and
  page errors. Drawer390/768/1024 open/Escape/focus/navigation/history and320
  resize/scroll restoration passed. Live API owner/query rejection, legacy
  redirect, guest login and foreign-invoice not-found without financial content
  passed. App Router's streamed not-found can carry HTTP200; its404 fallback
  marker and absence of the foreign invoice's content were verified.
- A synthetic503 overview read recovers by retry while existing services remain.
  Actual client navigation public Cloud → private workspace → public Cloud retains
  heading, typography, surface and spacing. Public source comparisons also match
  HEAD. Safe screenshots/reports are local under `var/cloud-workspace`;
  `browser-final-report.json`, `browser-extra-report.json` and themed PNGs
  are evidence, not shipped fixtures or production screenshots.

Initial browser runs found a bad CSS import and insufficient contrast; both were
fixed and affected views rerun successfully. A test locator assumed an HTML h1
where the canonical invoice uses an ARIA heading; the harness now uses semantics.
The temporary dev compiler restarted at its memory threshold; only its isolated
heap was adjusted, then final checks passed. An initial architecture gate found a
route-local DB lookup; it moved behind the Hosting owner and the complete gate
passed. These initial failures were not treated as passing evidence.

## Limits, cleanup and rollback

No schema, migration, dependency, stable version or provider integration changes.
Realtime host usage/provisioning and external payment/provider calls are not
claimed; existing manual/driver capabilities retain their actual configuration.
No production build/release-upgrade proof is claimed for this feature.

Cleanup completed: verified owned runtime, database and NOSUPERUSER role are
absent; only named task archives/setup/cleanup files were removed. The task tunnel,
local synthetic session JSON and TLS keys/certificates were deleted; safe reports
and screenshots remain ignored locally. UID1000 cleanup hit ENOTDIR on the archive
after removing the runtime/DB/role; the exact-name root finalizer verified their
absence and removed the archive. No unrelated process, checkout or data was purged.

During final validation Docker/WSL stopped responding. Graceful Desktop restart
timed out; only the Docker distro and verified Docker installation processes were
restarted, with no volume removal. Both existing containers recovered, PostgreSQL
is healthy and shared app3000 returned HTTP200. Final nonroot types and source
syntax/import checks passed after recovery; no test-preview restart was needed.
A host-only source attempt lacked the optional typescript-api package; the
canonical Linux check then passed on3260 source files.
Rollback is a revert of this feature slice: old detail owners and public entries
remain compatible, and persisted Cloud checkout markers resolve publicly after
rollback without changing order/payment/wallet data. No data purge is needed.

## Specialist frame repair — 2026-11-26

Owner requests the approved wide account-dashboard proportions for Cloud/Pay.
Cloud shell now uses a full-height 276px side column and fluid remaining viewport;
its root-div 1440px cap is removed. Only the active menu group opens by default;
mobile/tablet native drawer, stored choices and existing ownership remain.
Public Cloud landing is untouched. PG cloud-workspace, canonical check, actual
themed/wide/mobile/tablet browser/axe and owned fixture cleanup passed.
[Exact shared repair evidence](MOBOCOM_PAY.md#paycloud-layout-and-first-terminal-repair--2026-11-26).
