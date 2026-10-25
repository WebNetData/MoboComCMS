-- Producers of a film or series, written like the director line and read into PRODUCER credits (additive).
ALTER TABLE "CinemaTitle" ADD COLUMN "producer" TEXT NOT NULL DEFAULT '';
