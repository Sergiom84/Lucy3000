ALTER TABLE "tenant_licenses" ADD COLUMN "trialStartedAt" TIMESTAMP(3);

UPDATE "tenant_licenses"
SET "trialStartedAt" = COALESCE("activatedAt", "updatedAt", "createdAt")
WHERE "trialStartedAt" IS NULL
  AND (
    status IN ('TRIAL', 'ACTIVE')
    OR "activatedAt" IS NOT NULL
  );
