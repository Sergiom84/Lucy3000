-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('HOMBRE', 'MUJER');

-- AlterTable
ALTER TABLE "clients"
ALTER COLUMN "gender" TYPE "Gender"
USING (
  CASE
    WHEN "gender" IS NULL OR btrim("gender") = '' THEN NULL
    WHEN upper(btrim("gender")) = 'HOMBRE' THEN 'HOMBRE'::"Gender"
    WHEN upper(btrim("gender")) = 'MUJER' THEN 'MUJER'::"Gender"
    ELSE NULL
  END
);
