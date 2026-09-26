-- Provider-specific, non-secret adapter settings. Keeping this generic means
-- most future VPN-panel integrations do not need another schema migration.
ALTER TABLE "Panel" ADD COLUMN "config" TEXT NOT NULL DEFAULT '{}';
