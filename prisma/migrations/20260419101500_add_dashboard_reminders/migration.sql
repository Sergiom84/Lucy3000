-- CreateTable
CREATE TABLE "dashboard_reminders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "dashboard_reminders_isCompleted_createdAt_idx" ON "dashboard_reminders"("isCompleted", "createdAt");
