-- Existing credentials and identities are preserved. Only new mobile registrations opt in.
ALTER TABLE "User" ADD COLUMN "passwordSetupRequired" BOOLEAN NOT NULL DEFAULT false;
