-- Additive: reputation is the reactions a member received, each by the weight of its kind. Every weight starts
-- at 1, so the first value is the count of reactions already stored: history is carried over, not reset.
-- Safe to repeat: the value is set from the reactions, never added to.
ALTER TABLE "ForumProfile" ADD COLUMN "reputation" INTEGER NOT NULL DEFAULT 0;
UPDATE "ForumProfile" p SET "reputation" = s.n
FROM (SELECT fp."userId" AS uid, COUNT(*)::int AS n FROM "ForumReaction" r JOIN "ForumPost" fp ON fp."id" = r."postId" WHERE r."userId" <> fp."userId" GROUP BY fp."userId") s
WHERE s.uid = p."userId";
CREATE INDEX "ForumProfile_reputation_idx" ON "ForumProfile"("reputation");
