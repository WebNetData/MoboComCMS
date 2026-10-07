-- Additive: a member's playback preferences. Existing members keep '{}' (no preference).
ALTER TABLE "User" ADD COLUMN "playbackPrefs" TEXT NOT NULL DEFAULT '{}';
