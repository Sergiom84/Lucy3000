-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "activeTreatmentCount" INTEGER,
ADD COLUMN     "activeTreatmentNames" TEXT,
ADD COLUMN     "bondCount" INTEGER,
ADD COLUMN     "debtAlertEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "giftVoucher" TEXT,
ADD COLUMN     "linkedClientId" TEXT,
ADD COLUMN     "linkedClientReference" TEXT,
ADD COLUMN     "relationshipType" TEXT;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_linkedClientId_fkey" FOREIGN KEY ("linkedClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
