-- Whether a user group is shown under its members' names. Additive.
ALTER TABLE "UserGroup" ADD COLUMN "showBadge" BOOLEAN NOT NULL DEFAULT true;
