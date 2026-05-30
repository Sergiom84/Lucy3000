import type { SqliteCompatibilityRuntime } from './helpers'

export const ensureClientCancelledAppointmentCountColumn = async ({
  prisma,
  tableExists,
  addColumnIfMissing
}: SqliteCompatibilityRuntime) => {
  const added = await addColumnIfMissing(
    'clients',
    'cancelledAppointmentCount',
    'ALTER TABLE "clients" ADD COLUMN "cancelledAppointmentCount" INTEGER NOT NULL DEFAULT 0'
  )

  if (!added || !(await tableExists('appointments'))) {
    return
  }

  await prisma.$executeRawUnsafe(`
    UPDATE "clients"
    SET "cancelledAppointmentCount" = (
      SELECT COUNT(*)
      FROM "appointments"
      WHERE "appointments"."clientId" = "clients"."id"
        AND "appointments"."status" IN ('CANCELLED', 'NO_SHOW')
    )
  `)
}
