PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_appointments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "cabin" TEXT NOT NULL DEFAULT 'LUCY',
    "professional" TEXT NOT NULL DEFAULT 'LUCY',
    "date" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "reminder" BOOLEAN NOT NULL DEFAULT true,
    "googleCalendarEventId" TEXT,
    "googleCalendarSyncStatus" TEXT NOT NULL DEFAULT 'DISABLED',
    "googleCalendarSyncError" TEXT,
    "googleCalendarSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_appointments" (
    "id",
    "clientId",
    "guestName",
    "guestPhone",
    "userId",
    "serviceId",
    "cabin",
    "professional",
    "date",
    "startTime",
    "endTime",
    "status",
    "notes",
    "reminder",
    "googleCalendarEventId",
    "googleCalendarSyncStatus",
    "googleCalendarSyncError",
    "googleCalendarSyncedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "clientId",
    NULL AS "guestName",
    NULL AS "guestPhone",
    "userId",
    "serviceId",
    "cabin",
    "professional",
    "date",
    "startTime",
    "endTime",
    "status",
    "notes",
    "reminder",
    "googleCalendarEventId",
    "googleCalendarSyncStatus",
    "googleCalendarSyncError",
    "googleCalendarSyncedAt",
    "createdAt",
    "updatedAt"
FROM "appointments";

DROP TABLE "appointments";
ALTER TABLE "new_appointments" RENAME TO "appointments";
CREATE UNIQUE INDEX "appointments_googleCalendarEventId_key" ON "appointments"("googleCalendarEventId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
