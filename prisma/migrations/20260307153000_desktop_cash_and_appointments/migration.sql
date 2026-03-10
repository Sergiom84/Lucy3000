-- CreateEnum
CREATE TYPE "Cabin" AS ENUM ('LUCY', 'TAMARA', 'CABINA_1', 'CABINA_2');

-- AlterTable
ALTER TABLE "appointments"
ADD COLUMN "cabin" "Cabin" NOT NULL DEFAULT 'LUCY';

-- AlterTable
ALTER TABLE "sales"
ADD COLUMN "appointmentId" TEXT;

-- Alter enum preserving legacy values
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BIZUM', 'OTHER');

ALTER TABLE "sales"
ALTER COLUMN "paymentMethod" TYPE "PaymentMethod"
USING (
  CASE
    WHEN "paymentMethod"::text IN ('CASH', 'CARD') THEN "paymentMethod"::text
    ELSE 'OTHER'
  END
)::"PaymentMethod";

DROP TYPE "PaymentMethod_old";

-- AlterTable
ALTER TABLE "cash_movements"
ADD COLUMN "saleId" TEXT,
ADD COLUMN "paymentMethod" "PaymentMethod";

-- CreateIndex
CREATE UNIQUE INDEX "sales_appointmentId_key" ON "sales"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_saleId_key" ON "cash_movements"("saleId");

-- AddForeignKey
ALTER TABLE "sales"
ADD CONSTRAINT "sales_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements"
ADD CONSTRAINT "cash_movements_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
