-- CreateEnum
CREATE TYPE "GoogleCalendarSyncStatus" AS ENUM ('DISABLED', 'SYNCED', 'ERROR');

-- AlterTable
ALTER TABLE "appointments"
ADD COLUMN "googleCalendarEventId" TEXT,
ADD COLUMN "googleCalendarSyncError" TEXT,
ADD COLUMN "googleCalendarSyncStatus" "GoogleCalendarSyncStatus" NOT NULL DEFAULT 'DISABLED',
ADD COLUMN "googleCalendarSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "google_calendar_config" (
    "id" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendClientInvites" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointments_googleCalendarEventId_key" ON "appointments"("googleCalendarEventId");
