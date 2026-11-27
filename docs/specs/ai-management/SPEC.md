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
