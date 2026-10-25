-- A cinema format may have its own shelf on the cinema home (additive; no format has one until the owner ticks it).
ALTER TABLE "CinemaFormat" ADD COLUMN "homeShelf" BOOLEAN NOT NULL DEFAULT false;
