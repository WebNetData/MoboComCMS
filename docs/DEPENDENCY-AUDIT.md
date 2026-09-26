# Production dependency baseline — 2026-09-22

The deployable baseline intentionally targets:

- Next.js `15.5.25` (Maintenance LTS)
- React / React DOM `19.2.8`
- NextAuth `4.24.15`
- Node.js `22` in the production Docker image
- Prisma `5.22.0`

The codebase runs on the patched Next.js 15 line and uses its asynchronous request
APIs (`cookies`, route `params` and page `searchParams`).

## Why not Next.js 16 in this release?

Next.js 16 is Active LTS, but the stable NextAuth v4 line used by this project
publishes a peer dependency through Next.js 15. Forcing that peer constraint in
a payment/auth production application would make this release less predictable.
The safe path is to keep Next.js 15 on its current security-backport line and
upgrade NextAuth/Auth.js and Next.js together after that combination is verified
in staging.

## Update policy

- Keep dependencies pinned in `package.json` for production builds.
- Keep the matching `package-lock.json` committed. Local and Docker builds use
  `npm ci` so releases install the exact dependency graph that passed validation.
- Review Next.js/React/Auth security releases before every production release.
- Run `npm run release:check` and `npm run build:postgres` before promotion.
- Dependency major upgrades belong in a dedicated release, not mixed with a
  payment/database migration.
