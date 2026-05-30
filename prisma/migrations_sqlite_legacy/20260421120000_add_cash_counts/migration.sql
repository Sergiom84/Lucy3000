-- CreateTable
CREATE TABLE "cash_counts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cashRegisterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expectedTotal" DECIMAL NOT NULL,
    "countedTotal" DECIMAL NOT NULL,
    "difference" DECIMAL NOT NULL,
    "denominations" TEXT NOT NULL,
    "isBlind" BOOLEAN NOT NULL DEFAULT false,
    "appliedAsClose" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_counts_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cash_counts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "cash_counts_cashRegisterId_createdAt_idx" ON "cash_counts"("cashRegisterId", "createdAt");
