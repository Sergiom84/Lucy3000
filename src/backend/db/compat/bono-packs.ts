import type { SqliteCompatibilityRuntime } from './helpers'

export const ensureMultipleBonoSessionsPerAppointment = async ({
  prisma,
  tableExists,
  indexExists
}: SqliteCompatibilityRuntime) => {
  if (!(await tableExists('bono_sessions'))) {
    return
  }

  if (await indexExists('bono_sessions_appointmentId_key')) {
    await prisma.$executeRawUnsafe('DROP INDEX "bono_sessions_appointmentId_key"')
  }
}
