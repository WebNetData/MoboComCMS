# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    NEXTAUTH_SECRET=build-only-placeholder-not-used-at-runtime-2026 \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run postinstall
RUN npm run release:check
RUN npm run build:postgres
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# pg_dump 17 keeps the optional in-app encrypted backup compatible with the
# recommended PostgreSQL 17 deployment. curl/tini are operational utilities.
# ffmpeg, 7z and zip clean downloaded files (admin → downloads, off by default).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg tini openssl ffmpeg p7zip-full zip \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
# The read-only integrity CLI reuses these canonical policies outside Next's bundle.
COPY --from=builder /app/src/modules/repository/domain/purchase-recovery.cjs ./src/modules/repository/domain/purchase-recovery.cjs
COPY --from=builder /app/src/modules/repository/server/vendor/archive-integrity.cjs ./src/modules/repository/server/vendor/archive-integrity.cjs
COPY --from=builder /app/deploy ./deploy

RUN mkdir -p /app/storage/covers /app/storage/clean-cache /app/storage/backups /app/storage/receipts /app/storage/forum /app/storage/tickets /app/var \
 && chown -R node:node /app/storage /app/var
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "deploy/docker-start.sh"]
