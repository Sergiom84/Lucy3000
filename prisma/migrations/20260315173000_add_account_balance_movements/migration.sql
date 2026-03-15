CREATE TYPE "AccountBalanceMovementType" AS ENUM ('TOP_UP', 'CONSUMPTION', 'ADJUSTMENT');

CREATE TABLE "account_balance_movements" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" "AccountBalanceMovementType" NOT NULL,
    "operationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "referenceItem" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_balance_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_balance_movements_clientId_operationDate_idx"
ON "account_balance_movements"("clientId", "operationDate");

CREATE INDEX "account_balance_movements_saleId_idx"
ON "account_balance_movements"("saleId");

ALTER TABLE "account_balance_movements"
ADD CONSTRAINT "account_balance_movements_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "clients"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_balance_movements"
ADD CONSTRAINT "account_balance_movements_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "sales"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
