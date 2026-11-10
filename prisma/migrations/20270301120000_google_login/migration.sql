-- Google sign-in: the Google account (OpenID subject) a member signs in with. Additive; every existing row stays as it was.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN "googleEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "googleLinkedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
