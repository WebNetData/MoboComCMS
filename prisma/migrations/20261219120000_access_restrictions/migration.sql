-- Expand the canonical Identity owner. Keep legacy dates for rolling readers and rollback.
BEGIN;
SET LOCAL TIME ZONE 'UTC';

CREATE TABLE "AccessRestriction" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'MODULE',
  "moduleKey" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "capabilities" TEXT NOT NULL DEFAULT '[]',
  "effectKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "issuedByUserId" INTEGER,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" INTEGER,
  "revocationReason" TEXT NOT NULL DEFAULT '',
  "issuanceAuditId" INTEGER,
  "revocationAuditId" INTEGER,
  "sourceKey" TEXT,
  "source" TEXT NOT NULL DEFAULT 'ADMIN',
  "sourceMetadata" TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT "AccessRestriction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccessRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccessRestriction_scope_shape" CHECK (coalesce((
    ("scope" = 'GLOBAL' AND "moduleKey" IS NULL AND "resourceType" IS NULL AND "resourceId" IS NULL) OR
    ("scope" = 'MODULE' AND "moduleKey" ~ '^[a-z][a-z0-9-]{1,49}$' AND "resourceType" IS NULL AND "resourceId" IS NULL) OR
    ("scope" = 'RESOURCE' AND length("resourceType") > 0 AND length("resourceId") > 0) OR
    ("scope" = 'CAPABILITY' AND "resourceType" IS NULL AND "resourceId" IS NULL)
  ), FALSE)),
  CONSTRAINT "AccessRestriction_expiry" CHECK ("expiresAt" IS NULL OR "expiresAt" > "startsAt"),
  CONSTRAINT "AccessRestriction_source" CHECK ("source" IN ('ADMIN','LEGACY_API','LEGACY','LEGACY_EXTERNAL')),
  CONSTRAINT "AccessRestriction_reason" CHECK ("source" NOT IN ('ADMIN','LEGACY_API') OR length(trim("reason")) BETWEEN 1 AND 500),
  CONSTRAINT "AccessRestriction_effect" CHECK ("effectKey" ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  CONSTRAINT "AccessRestriction_metadata" CHECK (jsonb_typeof("sourceMetadata"::jsonb) = 'object'),
  CONSTRAINT "AccessRestriction_revocation" CHECK ("revokedAt" IS NOT NULL OR ("revokedByUserId" IS NULL AND "revocationAuditId" IS NULL AND "revocationReason" = ''))
);

-- CASE keeps non-array JSON from reaching the set-returning array parser.
CREATE FUNCTION "validAccessRestrictionCapabilities"(payload TEXT) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE WHEN jsonb_typeof(payload::jsonb) = 'array'
    THEN jsonb_array_length(payload::jsonb) > 0 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload::jsonb) AS item
      WHERE jsonb_typeof(item) <> 'string' OR (item #>> '{}') !~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'
    ) ELSE FALSE END
$$;
ALTER TABLE "AccessRestriction" ADD CONSTRAINT "AccessRestriction_capabilities"
  CHECK ("validAccessRestrictionCapabilities"("capabilities"));

CREATE UNIQUE INDEX "AccessRestriction_sourceKey_key" ON "AccessRestriction"("sourceKey");
CREATE INDEX "AccessRestriction_userId_scope_moduleKey_revokedAt_expiresAt_idx"
  ON "AccessRestriction"("userId", "scope", "moduleKey", "revokedAt", "expiresAt");
CREATE INDEX "AccessRestriction_userId_moduleKey_effectKey_idx"
  ON "AccessRestriction"("userId", "moduleKey", "effectKey");
ALTER TABLE "ForumProfile" ADD COLUMN "sanctionProjection" TEXT NOT NULL DEFAULT '';

-- Backfill all historical dates, including expired sanctions. Issuer/start are
-- unknown: never attribute them to a real manager or pretend epoch is known.
INSERT INTO "AccessRestriction" ("userId", "moduleKey", "capabilities", "effectKey", "reason", "startsAt", "expiresAt", "sourceKey", "source", "sourceMetadata")
SELECT profile."userId", 'forum', '["forum.participate","forum.private-message"]', sanction.effect,
  profile."moderationNote", least(TIMESTAMP '1970-01-01', sanction.until - INTERVAL '1 millisecond'), sanction.until,
  'legacy-forum:' || profile."userId" || ':' || sanction.effect, 'LEGACY', '{"issuerUnknown":true,"startUnknown":true}'
FROM "ForumProfile" AS profile
CROSS JOIN LATERAL (VALUES ('forum.silence', profile."silencedUntil"), ('forum.suspend', profile."suspendedUntil")) AS sanction(effect, until)
WHERE sanction.until IS NOT NULL
ON CONFLICT ("sourceKey") DO NOTHING;

-- Snapshot exact old values without clearing expired dates during migration.
-- New readers project effective records; old readers already compare expiry.
UPDATE "ForumProfile" SET "sanctionProjection" =
  '{"silencedUntil":' || coalesce(to_json(to_char("silencedUntil", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text, 'null') ||
  ',"suspendedUntil":' || coalesce(to_json(to_char("suspendedUntil", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text, 'null') || '}';

COMMIT;
