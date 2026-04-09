ALTER TABLE "appointments"
ADD COLUMN "guestName" TEXT,
ADD COLUMN "guestPhone" TEXT;

ALTER TABLE "appointments"
ALTER COLUMN "clientId" DROP NOT NULL;
