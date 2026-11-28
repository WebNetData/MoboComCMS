# Dedicated Cloud customer workspace — 2026-11-26

## Customer dashboard redesign — 2026-11-28

### Navigation and account portrait

The desktop sidebar and mobile drawer share the refreshed Cloud menu, with a
prominent service-creation link, grouped destinations and a clearer current
route. The account link uses the canonical session image and the existing
`ProfilePortrait` component, which falls back to an initial if the image is
missing or fails to load. The drawer keeps its native modal behavior and
Escape focus restoration.

Local Edge checks at 320, 390 and 1440 px covered both themes, profile image
precedence over the Telegram fallback, broken-image fallback, keyboard
expansion, account navigation from the drawer and scoped axe. The image
network response was a synthetic fixture while the session and profile were
read from PostgreSQL. The connected `cloud-workspace` suite and TypeScript
passed. React Doctor reported the existing native dialog backdrop handler
as an accessibility warning. Keyboard dismissal and focus were verified.

Continued from main `16cfa69a` in `.mobocom/cloud-dashboard-local-tools`,
branch `feat/cloud-dashboard-redesign`. The new dashboard uses a CSS network
illustration, resource cards with actual active counts, a service list with
detail links, urgent items and due dates, allocated capacity, invoices and
recent activity. The common shell styles the service, invoice, support and
ordering screens. The existing mobile drawer, keyboard behavior, themes and
canonical Hosting, Billing, Support and Identity routes are used.

The preview reused checked-in SDS/MoboCom tokens. A connected Figma reference
was unavailable. Initial illustration motion respects reduced motion. The
capacity section totals purchased plans and does not report live utilization.
This change has no database migration or external provider calls in its design.

Edge with an isolated PostgreSQL fixture exercised the populated dashboard at
320, 390, 768 and 1440 px, including light/dark, account isolation, empty/error
states, service details, invoices, wallet, support, catalog lists and the order
wizard. Scoped axe checks and keyboard drawer restoration passed. PostgreSQL
suites `cloud-workspace`, `ticket-workspaces`, and
`dashboard-service-ordering` passed. TypeScript, source, architecture and the
scoped React Doctor scan passed.

## Scoped ticket service selection — 2026-11-27

Continue PR #514 on `feat/cloud-dashboard-local-tools-2026-11-27` from
`6c989854`. Cloud offers the customer's own hosting services and domains, and
Pay offers the active merchant's own terminals. Both use canonical Support
and show the saved service to the customer and permitted staff. Account support
continues to use its existing product, order, warranty and subscription options.

`Ticket.serviceContext` stores a bounded key and label from the server lookup.
The additive `20270417120000_ticket_service_context` migration is registered
as unreleased. An earlier build can ignore the extra column and retain all
tickets and messages. No backfill is needed.

On isolated PostgreSQL 17, the migration preserved a ticket and message from
the pre-change database. The `ticket-workspaces`, `support-ticket-claim` and
`cloud-workspace` suites passed against a separate database. An actual HTTP run
verified both scoped options, omitted selection, saved labels, denial of
foreign or cross-section IDs, and preserved Store choices for account support.
Edge checked both composers at 390 and 1440 px in both themes, using the actual
ticket API for one Cloud and one Pay submission and scoped axe for each
selector. TypeScript, architecture, source, schema, manifest, security, scoped
React Doctor and redacted secret scanning passed locally.

## Cloud wallet, support and account — 2026-11-27

Owner requested a standalone Cloud dashboard with main-dashboard navigation
style and local wallet, support and ticket workflows. The continuation is
`.mobocom/cloud-dashboard-local-tools`, branch
`feat/cloud-dashboard-local-tools-2026-11-27`, from main `92133a8d`.

- The Cloud menu uses the shared ShellNav, existing tokens, a visible current
  route, fluid content and the native mobile drawer. Wallet, tickets and account
  are direct destinations in the Cloud workspace.
- The Cloud wallet reads the existing ledger and submits to the Wallet owner
  through Hosting's workspace authorization. The stored invoice and ledger keys
  use separate server namespaces so a member-mode client key cannot change
  surfaces. A verified Cloud wallet history entry links to the exact owned
  invoice. Billing composes the canonical invoice, official print and result.
- Cloud tickets use existing Support authorization, department and attachment
  flows. A reloadable selection URL lives inside the workspace. The main ticket
  page retains its existing related-order link. Account composes canonical
  Identity settings and a closed return for Google linking and password re-login.
- The change requires no schema migration. All records remain in their canonical
  ledger, account and support owners. A code rollback retains those records and
  uses the existing public/account invoice routes to reach earlier payments.

Completed local checks on isolated Linux Node 22 and PostgreSQL 17 include the
native `cloud-workspace`, `dashboard-service-ordering`, `support-ticket-claim`
and `google-login` suites. They cover exact-origin invoice/ledger replay,
foreign-owner denial, normal-wallet compatibility, Hosting filtering, ticket
authorization and the closed Google linking return. TypeScript, architecture and
source checks and the money primitive check passed. The focused checkout unit
suite passed 10 tests. React Doctor reported two complexity warnings in the
extracted account and wallet views, with no errors.

Browser runs used two synthetic members and a manual transfer fixture. Edge
covered the Cloud menu at 320, 390, 768, 1024, 1440 and 1920 px in both themes,
including keyboard containment, Escape and resize restoration. Scoped axe
reported no navigation violations at 390 and 1440 px. The wallet browser run
covered top-up, the exact ledger link, official print, the local result and
other-owner denial. The ticket run created, replied, reloaded and followed a
deep link, with foreign access denied. Editing the Cloud account persisted to
the same member visible in the main profile. External providers and production
deployment require the owner's environment.

The drawer treats the React state as its open/close owner. A delayed native
close event from Escape no longer closes a freshly reopened drawer.

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
