CREATE SEQUENCE IF NOT EXISTS tenant_code_seq;

ALTER TABLE "tenants" ADD COLUMN "tenantCode" INTEGER;

WITH numbered_tenants AS (
  SELECT
    id,
    row_number() OVER (ORDER BY "createdAt", id)::integer AS code
  FROM "tenants"
)
UPDATE "tenants"
SET "tenantCode" = numbered_tenants.code
FROM numbered_tenants
WHERE "tenants".id = numbered_tenants.id;

SELECT setval(
  'tenant_code_seq',
  GREATEST(COALESCE((SELECT MAX("tenantCode") FROM "tenants"), 0), 1),
  COALESCE((SELECT MAX("tenantCode") FROM "tenants"), 0) > 0
);

ALTER TABLE "tenants"
  ALTER COLUMN "tenantCode" SET DEFAULT nextval('tenant_code_seq'::regclass),
  ALTER COLUMN "tenantCode" SET NOT NULL;

ALTER SEQUENCE tenant_code_seq OWNED BY "tenants"."tenantCode";

CREATE UNIQUE INDEX "tenants_tenantCode_key" ON "tenants"("tenantCode");
