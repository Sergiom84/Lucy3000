-- CreateTable
CREATE TABLE "pending_payment_collections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pendingPaymentId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "showInOfficialCash" BOOLEAN NOT NULL DEFAULT true,
    "operationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pending_payment_collections_pendingPaymentId_fkey" FOREIGN KEY ("pendingPaymentId") REFERENCES "pending_payments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pending_payment_collections_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pending_payment_collections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pending_payment_collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "pending_payment_collections_pendingPaymentId_operationDate_idx" ON "pending_payment_collections"("pendingPaymentId", "operationDate");

-- CreateIndex
CREATE INDEX "pending_payment_collections_saleId_operationDate_idx" ON "pending_payment_collections"("saleId", "operationDate");

-- CreateIndex
CREATE INDEX "pending_payment_collections_clientId_operationDate_idx" ON "pending_payment_collections"("clientId", "operationDate");

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "paymentBreakdown" TEXT;
