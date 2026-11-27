# Release 1.7.27 — 2026-11-27

## Scope

The release worktree is `.mobocom/release-1.7.27` on `release/1.7.27`, based
on merged main `60edb843`. It contains merged PR #513 for Pay bot customer ID
compatibility and merged PR #514 for the dedicated Cloud dashboard plus
service-scoped support choices for Cloud and Pay. The release owner requested
removing Cloud entries from the main dashboard navigation while preserving
existing direct routes.

## Database

The 1.7.27 manifest seals `20270417120000_ticket_service_context`.
Do not edit a published migration. Ticket service context is optional and
bounded; prior tickets need no backfill.

## Documentation

Release summary: [1.7.27](../../releases/1.7.27.md). Persian release and upgrade
guides point to the new release. Workstate records this release checkout.

## Evidence and status

The account shell keeps its ordinary wallet and Support links. Cloud overview,
server, hosting, domain and all-services entries are removed from the main
desktop and mobile menu. Existing Cloud entry routes continue to redirect to
the dedicated workspace.

On isolated PostgreSQL 17, an empty install and non-demo seed completed. A
database migrated from the v1.7.26 tree retained a ticket and its message after
the new migration. The encrypted backup restored identical fixture rows and
migration count, and a tampered copy was rejected. The scoped Cloud workspace,
ticket, checkout, Google login and Pay suites passed. Release publication
records the final commit, executed release gates and signed artifact hashes.

The optimized PostgreSQL build and production preflight passed. The local
production browser verified the ordinary account menu and independent Cloud
menu at 1440 and 390 px in both themes. The old Cloud server route redirected
to the dedicated workspace, core public routes returned successfully and the
guest workspace redirected to sign-in.
