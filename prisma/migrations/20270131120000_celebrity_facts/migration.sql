-- An artist's profile fields beyond the biography (country, born, died and the owner's own): JSON code → value. Additive.
ALTER TABLE "Celebrity" ADD COLUMN "facts" TEXT NOT NULL DEFAULT '{}';
