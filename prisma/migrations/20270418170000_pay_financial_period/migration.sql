CREATE TABLE "PayFinancialPeriod" (
  "id" TEXT PRIMARY KEY,
  "fromDay" TEXT NOT NULL,
  "toDay" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REVIEW' CHECK ("status" IN ('REVIEW', 'CLOSED')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "reviewerId" INTEGER NOT NULL,
  "discrepancyNote" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PayFinancialPeriod_fromDay_toDay_key" ON "PayFinancialPeriod" ("fromDay", "toDay");

CREATE TABLE "PayFinancialPeriodRevision" (
  "periodId" TEXT NOT NULL REFERENCES "PayFinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL,
  "actorId" INTEGER NOT NULL,
  "reviewerId" INTEGER NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('SUBMIT', 'ASSIGN', 'REVIEW', 'CLOSE', 'CORRECT')),
  "note" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("periodId", "version")
);

CREATE FUNCTION mobocom_pay_period_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Pay financial period revisions are immutable';
END;
$$;
CREATE TRIGGER "PayFinancialPeriodRevision_immutable"
BEFORE UPDATE OR DELETE ON "PayFinancialPeriodRevision"
FOR EACH ROW EXECUTE FUNCTION mobocom_pay_period_revision_immutable();
