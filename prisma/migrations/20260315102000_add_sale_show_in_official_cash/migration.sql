-- Track whether a sale should impact official cash movements/summary.
ALTER TABLE "sales"
ADD COLUMN "showInOfficialCash" BOOLEAN NOT NULL DEFAULT true;
