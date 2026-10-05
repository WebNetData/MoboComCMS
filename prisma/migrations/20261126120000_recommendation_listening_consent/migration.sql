-- Additive and off for everyone: listening history shapes suggestions only after the member turns this on.
ALTER TABLE "User" ADD COLUMN "recommendationListeningOptIn" BOOLEAN NOT NULL DEFAULT false;
