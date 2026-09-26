# Build-verified source snapshot

This source snapshot contains the source-level changes that were applied on the deployment server before the production Docker image completed successfully on 2026-09-22.

Verified server build result:

```text
[+] Building ... FINISHED
[+] build 1/1
✔ Image happvpn-app:local Built
```

Notable compatibility fixes included in this snapshot:

- `react-simple-maps` upgraded from 3.0.0 to 5.0.5 for React 19.
- `WorldMap.tsx` adapted to v5 TypeScript types and SVG styling.
- OpenSSL installed in Docker dependency, builder, and runner stages for Prisma.
- Docker builder receives a non-production build-only `NEXTAUTH_SECRET`; the real production secret remains a runtime environment variable.
- FrenzyEx webhook `runtime = 'nodejs'` is declared directly in its Next.js route file.

## Dependency lock

The repository includes the lock file generated after the dependency upgrade. Keep it committed and use the reproducible install path below:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run release:check
npm run build:postgres
```

Never commit `.env`, production database dumps, private keys, or `/storage` contents into the source repository/archive.
