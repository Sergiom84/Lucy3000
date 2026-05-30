ALTER TABLE "account_balance_movements"
ADD COLUMN "legacyRef" TEXT;

ALTER TABLE "account_balance_movements"
ADD COLUMN "importSource" TEXT;

CREATE UNIQUE INDEX "account_balance_movements_clientId_legacyRef_importSource_key"
ON "account_balance_movements"("clientId", "legacyRef", "importSource");

ALTER TABLE "bono_packs"
ADD COLUMN "legacyRef" TEXT;

ALTER TABLE "bono_packs"
ADD COLUMN "importSource" TEXT;

CREATE UNIQUE INDEX "bono_packs_clientId_legacyRef_importSource_key"
ON "bono_packs"("clientId", "legacyRef", "importSource");
