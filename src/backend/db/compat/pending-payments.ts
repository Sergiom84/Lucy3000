import type { SqliteCompatibilityRuntime } from './helpers'

export const ensurePendingPaymentsTable = async ({
  prisma,
  tableExists,
  getTableColumns,
  indexExists
}: SqliteCompatibilityRuntime) => {
  if (!(await tableExists('pending_payments'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "pending_payments" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "saleId" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "amount" DECIMAL NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "settledAt" DATETIME,
        "settledPaymentMethod" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "pending_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "pending_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
  } else {
    const pendingPaymentColumns = await getTableColumns('pending_payments')
    const hasSettledPaymentMethod = pendingPaymentColumns.some(
      (column) => column.name === 'settledPaymentMethod'
    )

    if (!hasSettledPaymentMethod) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "pending_payments" ADD COLUMN "settledPaymentMethod" TEXT'
      )
    }
  }

  if (!(await indexExists('pending_payments_saleId_key'))) {
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "pending_payments_saleId_key" ON "pending_payments"("saleId")'
    )
  }

  if (!(await indexExists('pending_payments_clientId_status_createdAt_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "pending_payments_clientId_status_createdAt_idx" ON "pending_payments"("clientId", "status", "createdAt")'
    )
  }
}

export const ensurePendingPaymentCollectionsTable = async ({
  prisma,
  tableExists,
  indexExists
}: SqliteCompatibilityRuntime) => {
  if (!(await tableExists('pending_payment_collections'))) {
    await prisma.$executeRawUnsafe(`
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
      )
    `)
  }

  if (!(await indexExists('pending_payment_collections_pendingPaymentId_operationDate_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "pending_payment_collections_pendingPaymentId_operationDate_idx" ON "pending_payment_collections"("pendingPaymentId", "operationDate")'
    )
  }

  if (!(await indexExists('pending_payment_collections_saleId_operationDate_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "pending_payment_collections_saleId_operationDate_idx" ON "pending_payment_collections"("saleId", "operationDate")'
    )
  }

  if (!(await indexExists('pending_payment_collections_clientId_operationDate_idx'))) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "pending_payment_collections_clientId_operationDate_idx" ON "pending_payment_collections"("clientId", "operationDate")'
    )
  }
}
