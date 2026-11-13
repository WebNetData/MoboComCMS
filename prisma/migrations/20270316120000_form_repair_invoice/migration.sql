-- A repair is invoiced at the shop counter (owner 2026-11-13): the paid counter sale that lists the parts and the work done.
-- One sale per repair; a step may require it paid before the device is handed back. Additive.
ALTER TABLE "FormSubmission" ADD COLUMN "repairOrderId" INTEGER;
CREATE UNIQUE INDEX "FormSubmission_repairOrderId_key" ON "FormSubmission"("repairOrderId");
