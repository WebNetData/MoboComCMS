-- «چهره‌ها» in «most known» order: the published works of each person, kept by the periodic sync. Additive.
ALTER TABLE "Celebrity" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Celebrity_score_idx" ON "Celebrity"("score");
