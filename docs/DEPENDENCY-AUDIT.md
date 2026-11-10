# Production dependency baseline — updated 2026-11-10

The deployable baseline (pinned in `package.json`, exact graph in `package-lock.json`):

- Next.js `16.4.6`. Owner decisions: [stack 2026-10-19](agent/PLATFORM_DECISIONS.md) and "Next.js 16.4.6 — 2026-11-10" in the same file.
- React / React DOM `19.3.1`
- NextAuth `4.24.15`. Its published peer range is `next: ^12.2.5 || ^13 || ^14 || ^15 || ^16`, so it supports Next.js 16 without a forced peer.
- TypeScript `7.0.2` (native compiler)
- Prisma / `@prisma/client` `5.22.0`
- Node.js `22` in the production Docker image (`node:22-bookworm-slim`). `engines.node` accepts `>=20.9 <25`.
- Overrides: `postcss 8.5.28`; `nodemailer` follows the direct dependency.

The application uses the asynchronous request APIs (`cookies`, `headers`, route `params` and page `searchParams`). Since Next.js 16, `src/proxy.ts` replaces the middleware.

## History

Until 2026-10-19 the baseline stayed on Next.js 15.5 because the NextAuth v4 line had not yet published Next.js 16 in its peer range. That reason no longer holds (see the peer range above). The owner moved the stack to Next.js 16.4.2, then to the 16.4.6 patch on 2026-11-10.

## Update policy

- Keep dependencies pinned in `package.json` for production builds.
- Keep the matching `package-lock.json` committed. Local and Docker builds use `npm ci`, so releases install the exact dependency graph that passed validation.
- Review Next.js/React/Auth security releases before every production release.
- Run `npm run release:check` and `npm run build:postgres` before promotion.
- Dependency major upgrades belong in a dedicated release, not mixed with a payment or database migration.
- A NextAuth v5 / Auth.js move is a separate, planned change: it would replace the providers and session callbacks in `src/modules/identity/auth.ts`.

Audit 2026-11-10 (item 10): versions above were read from `package.json` and the installed `node_modules` (`next 16.4.6`, `next-auth 4.24.15` with the peer range quoted).
