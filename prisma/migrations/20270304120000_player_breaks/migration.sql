-- Ads in the film player: a video creative, when it may be skipped and how long a picture stays. Additive; existing
-- creatives keep the defaults and banner slots never receive a video (ads/domain/ads.ts creativeFits).
ALTER TABLE "AdCreative" ADD COLUMN "videoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AdCreative" ADD COLUMN "skipAfter" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "AdCreative" ADD COLUMN "seconds" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_skipAfter_check" CHECK ("skipAfter" BETWEEN 0 AND 60);
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_seconds_check" CHECK ("seconds" BETWEEN 3 AND 30);
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_video_check" CHECK (("kind" = 'VIDEO') = ("videoUrl" <> '') AND length("videoUrl") <= 2000);
