-- Additive: saved views of the admin workspace, one list per staff member.
CREATE TABLE "AdminSavedView" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminSavedView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminSavedView_userId_name_key" ON "AdminSavedView"("userId", "name");
ALTER TABLE "AdminSavedView" ADD CONSTRAINT "AdminSavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
