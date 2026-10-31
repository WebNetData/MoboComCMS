-- Role deletion must never turn an assigned staff member into full-access staff.
-- The API already forbids deleting occupied roles; the FK also holds under races.
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
