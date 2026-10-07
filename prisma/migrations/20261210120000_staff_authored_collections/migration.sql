-- Additive: collections written by staff. Every existing collection is a member's and keeps false.
ALTER TABLE "UserCollection" ADD COLUMN "staffAuthored" BOOLEAN NOT NULL DEFAULT false;
