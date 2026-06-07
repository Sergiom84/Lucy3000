-- CreateTable
CREATE TABLE "client_files" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.current_tenant_id', true),
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "photoCategory" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "takenAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_files_tenantId_clientId_idx" ON "client_files"("tenantId", "clientId");

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_clientId_tenantId_fkey"
    FOREIGN KEY ("clientId", "tenantId") REFERENCES "clients"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;
