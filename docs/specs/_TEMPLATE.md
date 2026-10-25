# <Feature name>

Copy to `docs/specs/<feature>/SPEC.md`. Keep it short and executable. Write "Not applicable" with a reason
instead of leaving a section out. A feature built in slices keeps this one spec with a section per slice
(see [forum-invision](forum-invision/SPEC.md)). The [whole-site quality standard](../agent/WHOLE_SITE_QUALITY_STANDARD.md),
section 5, lists what each part must answer.

## Outcome and owner

What the owner asked for (with the date) and the result a user sees. The module that owns it, the existing owner
service it extends, and what it deliberately does not do. Audit the checkout first: name what already exists.

## Actors and authorization

Who does what, with the exact permission from `src/modules/identity/rbac.ts` (or the section's plugin manifest),
section-specific where it applies. Explicit denies, an author's own-items scope, module-off behaviour.

## Data and compatibility

Models and fields (typed, relational; constraints the database enforces), the additive migration and its line in
`prisma/release-manifest.json`, backfill of stored rows, both Prisma schemas in parity, and how older readers
keep working. Rollback: what reverting the code leaves behind.

## Flows

The happy path, then the edge paths: invalid input, concurrency, failure of a dependency, an item already in the
target state, a deleted or inactive related record.

## Admin and public UI

Admin: list (search, filters, columns, empty/error states), form (sections, conditional fields, pickers), settings.
Public: pages, filters, labels, SEO. Protected visuals, URLs and permissions stay as they are. RTL, mobile,
keyboard and light/dark.

## Contracts and security

APIs (route, guard, origin, rate limit, audit row), events, jobs, versioning when another client may rely on it.
Uploads, money states (the claim it makes and the database rule it relies on), secrets.

## Acceptance

- Connected PostgreSQL script `scripts/<name>.connected.cjs`, registered in `scripts/run-pg-checks.cjs`, and the
  deliberate breaks that must fail it.
- Browser test (routes, viewports) and what it proves; React Doctor result.
- What was not run, stated plainly.
