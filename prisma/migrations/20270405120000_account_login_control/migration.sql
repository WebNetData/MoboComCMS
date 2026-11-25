-- Additive defaults preserve every existing sign-in method. Session revocation
-- has its own timestamp and never claims that a member knows a password.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginPolicy" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsRevokedAt" TIMESTAMP(3);
-- A terminal non-authenticating tombstone retains references from immutable
-- shared money facts after the person's account and personal data are erased.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "erasedAt" TIMESTAMP(3);
