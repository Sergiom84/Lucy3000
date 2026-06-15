CREATE TABLE "trial_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REPLY',
    "ownerEmailDeliveredAt" TIMESTAMP(3),
    "requesterEmailDeliveredAt" TIMESTAMP(3),
    "ownerEmailId" TEXT,
    "requesterEmailId" TEXT,
    "lastDeliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trial_requests_normalizedEmail_key" ON "trial_requests"("normalizedEmail");
CREATE UNIQUE INDEX "trial_requests_normalizedPhone_key" ON "trial_requests"("normalizedPhone");
CREATE INDEX "trial_requests_status_createdAt_idx" ON "trial_requests"("status", "createdAt");

ALTER TABLE "trial_requests" ENABLE ROW LEVEL SECURITY;
