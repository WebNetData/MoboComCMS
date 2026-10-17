-- Extend existing people in place; IDs, canonical matching keys and credits remain.
ALTER TABLE "CinemaPerson"
  ADD COLUMN "displayNameKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "imageLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "profileVersion" INTEGER NOT NULL DEFAULT 0;
