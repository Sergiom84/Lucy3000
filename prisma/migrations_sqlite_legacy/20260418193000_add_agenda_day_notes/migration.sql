CREATE TABLE "agenda_day_notes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dayKey" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "agenda_day_notes_dayKey_createdAt_idx" ON "agenda_day_notes"("dayKey", "createdAt");
