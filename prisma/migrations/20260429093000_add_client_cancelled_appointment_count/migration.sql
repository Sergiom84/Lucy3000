ALTER TABLE "clients" ADD COLUMN "cancelledAppointmentCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "clients"
SET "cancelledAppointmentCount" = (
  SELECT COUNT(*)
  FROM "appointments"
  WHERE "appointments"."clientId" = "clients"."id"
    AND "appointments"."status" IN ('CANCELLED', 'NO_SHOW')
);
