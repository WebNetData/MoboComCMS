# AI management desk

An authorized staff member opens the desk, identifies a priority by its
section and source count, and navigates to the existing panel responsible
for deciding what happens next. When requested, the existing Operations
model explains a follow-up step for findings from that review.

## Access and evidence

- An active Admin session and enabled AI Assistant are required. Each section
  uses its owner permission, including Store orders, Pay, Hosting, the separate
  editorial permissions, forum, reviews and site settings. Support uses
  department authorization and CRM uses its existing manager/assignee scope.
- Each checked section exposes fixed labels, nonnegative counts and an owner
  link. A failure in one reader yields an unavailable state. Sections outside
  the current scope are omitted. A zero count describes the selected indicator
  at the displayed timestamp.
- Model input is limited to positive counts, fixed labels and stable IDs.
  A response must link each suggestion to an existing ID, with bounded
  plain text. Same-origin validation, strict quota and audit apply. Access,
  module state and evidence are checked again after the model returns.
- The existing Operations proposal mechanism remains the route for supported
  writes. The desk is a read/analysis entry point with no new write capability,
  persistence or migrations.

## Acceptance

- PostgreSQL: stale/closed/recent tickets, separate departments, authorized
  and forbidden report scopes, partial source failure, changed authorization
  during inference, module off and invalid response IDs.
- Browser: independent Admin menu entry, RTL filter and evidence, both themes
  at 390 and 1440 px, first load/empty/failure states, and reviewed rendering of
  advice. Tests use synthetic data and a model double.
- Rollback: revert the desk, route and navigation changes in code.

## Scheduled reviews and follow-up

- Each Admin may opt into a review every one or seven days, or run one on
  demand. The normal scheduled queue checks due rows in bounded batches.
  One transaction advances the due slot and records the findings, so two
  workers cannot record the same slot. A late run schedules the next review
  from its actual time. A disabled AI module pauses scheduled collection.
- Scheduled authority resolves the initiating canonical User and the current
  Admin role, sign-in revocation, second-factor requirement and section
  permissions. A revoked grant disables that schedule. History remains
  owner-scoped and is shown within the exact current section and department
  scope. Settings, snapshots and review decisions use explicit same-origin
  commands, strict rate limits and current authentication.
- Each finding starts pending. Approve it for follow-up or dismiss it with a
  reason. An approved item links to its owning panel and may be marked done
  with an outcome. Audit and a version claim commit with the change. Retrying
  an already decided version returns a conflict. Operational changes use the
  existing approval tools and domain owners.
- Migrate with `20270418120000_ai_management_reviews` before starting the
  new code. Existing accounts start without a schedule. Rollback preserves
  the two additive tables and their history.
