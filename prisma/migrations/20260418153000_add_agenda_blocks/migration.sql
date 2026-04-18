-- CreateTable
CREATE TABLE "agenda_blocks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "professional" TEXT NOT NULL,
    "cabin" TEXT NOT NULL DEFAULT 'LUCY',
    "date" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "notes" TEXT,
    "googleCalendarEventId" TEXT,
    "googleCalendarSyncStatus" TEXT NOT NULL DEFAULT 'DISABLED',
    "googleCalendarSyncError" TEXT,
    "googleCalendarSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "agenda_blocks_googleCalendarEventId_key" ON "agenda_blocks"("googleCalendarEventId");

