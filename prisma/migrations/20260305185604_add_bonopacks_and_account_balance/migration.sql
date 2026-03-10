-- CreateEnum
CREATE TYPE "BonoPackStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BonoSessionStatus" AS ENUM ('AVAILABLE', 'CONSUMED');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "accountBalance" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "bono_packs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceId" TEXT,
    "totalSessions" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "status" "BonoPackStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bono_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bono_sessions" (
    "id" TEXT NOT NULL,
    "bonoPackId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "status" "BonoSessionStatus" NOT NULL DEFAULT 'AVAILABLE',
    "consumedAt" TIMESTAMP(3),
    "appointmentId" TEXT,
    "notes" TEXT,

    CONSTRAINT "bono_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bono_sessions_appointmentId_key" ON "bono_sessions"("appointmentId");

-- AddForeignKey
ALTER TABLE "bono_packs" ADD CONSTRAINT "bono_packs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_packs" ADD CONSTRAINT "bono_packs_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_sessions" ADD CONSTRAINT "bono_sessions_bonoPackId_fkey" FOREIGN KEY ("bonoPackId") REFERENCES "bono_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono_sessions" ADD CONSTRAINT "bono_sessions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
