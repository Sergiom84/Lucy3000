-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN "openingDenominations" TEXT;
ALTER TABLE "cash_registers" ADD COLUMN "countedTotal" DECIMAL;
ALTER TABLE "cash_registers" ADD COLUMN "countedDenominations" TEXT;
ALTER TABLE "cash_registers" ADD COLUMN "arqueoDifference" DECIMAL;
ALTER TABLE "cash_registers" ADD COLUMN "nextDayFloat" DECIMAL;
ALTER TABLE "cash_registers" ADD COLUMN "nextDayFloatDenominations" TEXT;
ALTER TABLE "cash_registers" ADD COLUMN "withdrawalAmount" DECIMAL;
