-- Existing decided cases can already have been resubmitted in their owning module.
-- Their round-one decisions were archived by the preceding additive migration.
-- Reopen only rows whose current owner actually says they are waiting; never change the content.
UPDATE "ModerationCase" c SET "status" = 'OPEN', "round" = c."round" + 1,
  "decision" = '', "decidedById" = NULL, "decidedAt" = NULL,
  "assigneeId" = NULL, "claimedAt" = NULL, "note" = '', "updatedAt" = CURRENT_TIMESTAMP
WHERE c."status" = 'DECIDED' AND EXISTS (
  SELECT 1 FROM "ModerationDecision" d WHERE d."caseId" = c."id" AND d."round" = c."round"
) AND (
  (c."source" = 'article-comments' AND EXISTS (SELECT 1 FROM "PostComment" x WHERE x."id" = c."itemId" AND x."status" = 'PENDING')) OR
  (c."source" = 'product-reviews' AND EXISTS (SELECT 1 FROM "ProductReview" x WHERE x."id" = c."itemId" AND x."status" = 'PENDING')) OR
  (c."source" = 'product-questions' AND EXISTS (SELECT 1 FROM "ProductQuestion" x WHERE x."id" = c."itemId" AND x."status" = 'PENDING')) OR
  (c."source" = 'item-reviews' AND EXISTS (SELECT 1 FROM "ItemReview" x WHERE x."id" = c."itemId" AND x."itemType" <> 'business' AND x."status" = 'PENDING')) OR
  (c."source" = 'business-experiences' AND EXISTS (SELECT 1 FROM "ItemReview" x WHERE x."id" = c."itemId" AND x."itemType" = 'business' AND x."status" = 'PENDING')) OR
  (c."source" = 'forum-posts' AND EXISTS (SELECT 1 FROM "ForumPost" x WHERE x."id" = c."itemId" AND x."status" = 'PENDING')) OR
  (c."source" = 'forum-flags' AND EXISTS (SELECT 1 FROM "ForumFlag" x WHERE x."id" = c."itemId" AND x."status" = 'PENDING')) OR
  (c."source" = 'community-reports' AND EXISTS (SELECT 1 FROM "CommunityReport" x WHERE x."id" = c."itemId" AND x."businessId" IS NULL AND x."status" = 'OPEN')) OR
  (c."source" = 'copyright' AND EXISTS (SELECT 1 FROM "CopyrightReport" x WHERE x."id" = c."itemId" AND x."status" IN ('NEW', 'REVIEWING'))) OR
  (c."source" = 'trash-posts' AND EXISTS (SELECT 1 FROM "Post" x WHERE x."id" = c."itemId" AND x."status" = 'TRASHED')) OR
  (c."source" = 'trash-cinema' AND EXISTS (SELECT 1 FROM "CinemaTitle" x WHERE x."id" = c."itemId" AND x."status" = 'TRASHED')) OR
  (c."source" = 'trash-music-tracks' AND EXISTS (SELECT 1 FROM "MusicTrack" x WHERE x."id" = c."itemId" AND x."status" = 'TRASHED')) OR
  (c."source" = 'trash-music-albums' AND EXISTS (SELECT 1 FROM "MusicAlbum" x WHERE x."id" = c."itemId" AND x."status" = 'TRASHED')) OR
  (c."source" = 'trash-games' AND EXISTS (SELECT 1 FROM "GameTitle" x WHERE x."id" = c."itemId" AND x."status" = 'TRASHED')) OR
  (c."source" = 'trash-software' AND EXISTS (SELECT 1 FROM "SoftwareTitle" x WHERE x."id" = c."itemId" AND x."status" = 'TRASHED'))
);
