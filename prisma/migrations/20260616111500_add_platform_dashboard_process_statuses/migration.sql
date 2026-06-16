ALTER TABLE "tenants" ADD COLUMN "commercialReplyStatus" TEXT NOT NULL DEFAULT 'EMAIL_RECEIVED';
ALTER TABLE "tenants" ADD COLUMN "commercialProcessStatus" TEXT NOT NULL DEFAULT 'PENDING_TRIAL';

ALTER TABLE "trial_requests" ADD COLUMN "replyStatus" TEXT NOT NULL DEFAULT 'PENDING_REPLY';
ALTER TABLE "trial_requests" ADD COLUMN "commercialProcessStatus" TEXT NOT NULL DEFAULT 'REQUEST_RECEIVED';

UPDATE "tenants" t
SET "commercialProcessStatus" = CASE
  WHEN l.status = 'ACTIVE' THEN 'PAID'
  WHEN l.status = 'TRIAL' AND l."trialEndsAt" < NOW() THEN 'TRIAL_EXPIRED'
  WHEN l.status = 'TRIAL' THEN 'TRIAL_STARTED'
  WHEN l.status = 'BLOCKED' THEN 'BLOCKED'
  WHEN l.status = 'CANCELLED' THEN 'NOT_CONTINUED'
  WHEN l.status = 'PENDING' THEN 'PENDING_TRIAL'
  ELSE 'PENDING_TRIAL'
END
FROM "tenant_licenses" l
WHERE l."tenantId" = t.id;

UPDATE "trial_requests"
SET
  "replyStatus" = CASE
    WHEN status = 'CONTACTED' THEN 'CONTACTED'
    WHEN status = 'EMAIL_FAILED' THEN 'EMAIL_FAILED'
    WHEN status = 'DISMISSED' THEN 'CLOSED'
    WHEN status = 'CONVERTED' THEN 'CLOSED'
    ELSE 'PENDING_REPLY'
  END,
  "commercialProcessStatus" = CASE
    WHEN status = 'CONTACTED' THEN 'CONTACTED'
    WHEN status = 'CONVERTED' THEN 'REGISTERED'
    WHEN status = 'DISMISSED' THEN 'NOT_CONTINUED'
    WHEN status = 'EMAIL_FAILED' THEN 'REQUEST_RECEIVED'
    ELSE 'REQUEST_RECEIVED'
  END;
