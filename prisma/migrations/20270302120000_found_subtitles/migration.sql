-- Subtitles that come with a video file: a same-named file beside it or a text track inside it. Additive; every existing row stays as it was.
ALTER TABLE "MediaLink" ADD COLUMN "subtitleScan" TEXT NOT NULL DEFAULT '';

CREATE TABLE "MediaLinkSubtitle" (
    "id" SERIAL NOT NULL,
    "linkId" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaLinkSubtitle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaLinkSubtitle_origin_check" CHECK ("origin" IN ('SIDECAR', 'EMBEDDED')),
    CONSTRAINT "MediaLinkSubtitle_format_check" CHECK ("format" IN ('vtt', 'srt', 'ass')),
    CONSTRAINT "MediaLinkSubtitle_content_size_check" CHECK (octet_length("content") <= 4194304)
);

CREATE UNIQUE INDEX "MediaLinkSubtitle_linkId_source_key" ON "MediaLinkSubtitle"("linkId", "source");

ALTER TABLE "MediaLinkSubtitle" ADD CONSTRAINT "MediaLinkSubtitle_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "MediaLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
