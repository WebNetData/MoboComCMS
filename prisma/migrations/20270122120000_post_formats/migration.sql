-- Magazine posts get a format from the owner's POST_FORMAT list (each format of a family: article, news, review,
-- video, interview) and the facts their family asks for. Additive: every existing post is an article.
ALTER TABLE "Post" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'ARTICLE';
ALTER TABLE "Post" ADD COLUMN "formatData" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Post" ADD CONSTRAINT "Post_format_check" CHECK ("format" ~ '^[A-Z0-9_]{1,40}$');
CREATE INDEX "Post_format_idx" ON "Post"("format");

INSERT INTO "Vocabulary" ("section", "list", "code", "name", "nameEn", "icon", "family", "sortOrder", "updatedAt") VALUES
    ('journal', 'POST_FORMAT', 'ARTICLE', 'مقاله', 'Article', '📝', 'ARTICLE', 0, now()),
    ('journal', 'POST_FORMAT', 'NEWS', 'خبر', 'News', '📰', 'NEWS', 1, now()),
    ('journal', 'POST_FORMAT', 'REVIEW', 'نقد و بررسی', 'Review', '⭐', 'REVIEW', 2, now()),
    ('journal', 'POST_FORMAT', 'VIDEO', 'ویدیو', 'Video', '🎬', 'VIDEO', 3, now()),
    ('journal', 'POST_FORMAT', 'INTERVIEW', 'مصاحبه', 'Interview', '🎙️', 'INTERVIEW', 4, now()),
    ('journal', 'POST_FORMAT', 'GUIDE', 'آموزش', 'Guide', '🧭', 'ARTICLE', 5, now())
ON CONFLICT ("section", "list", "code") DO NOTHING;
