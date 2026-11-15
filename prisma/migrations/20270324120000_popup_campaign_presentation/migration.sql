-- Presentation only; existing popup content, audiences, schedules and counts stay intact.
ALTER TABLE "SitePopup" ADD COLUMN "presentation" TEXT NOT NULL DEFAULT '{}';
