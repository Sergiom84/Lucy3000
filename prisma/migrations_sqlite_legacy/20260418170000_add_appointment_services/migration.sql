CREATE TABLE IF NOT EXISTS "appointment_services" (
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    PRIMARY KEY ("appointmentId", "serviceId"),
    CONSTRAINT "appointment_services_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appointment_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "appointment_services_appointmentId_sortOrder_key"
ON "appointment_services"("appointmentId", "sortOrder");

INSERT OR IGNORE INTO "appointment_services" ("appointmentId", "serviceId", "sortOrder")
SELECT "id", "serviceId", 0
FROM "appointments"
WHERE "serviceId" IS NOT NULL
  AND TRIM("serviceId") <> '';
