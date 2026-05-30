import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '../db'

export const CLIENT_CANCELLED_APPOINTMENT_STATUSES = ['CANCELLED', 'NO_SHOW'] as const

type ClientCancellationCountDb = {
  appointment: {
    count: (args: Prisma.AppointmentCountArgs) => Promise<number>
  }
  client: {
    update: (args: Prisma.ClientUpdateArgs) => Promise<unknown>
  }
}

const toClientId = (value: unknown) => {
  const clientId = String(value || '').trim()
  return clientId || null
}

export const syncClientCancelledAppointmentCounts = async (
  clientIds: Array<string | null | undefined>,
  db: ClientCancellationCountDb = prisma as PrismaClient
) => {
  const uniqueClientIds = [...new Set(clientIds.map(toClientId).filter((clientId): clientId is string => Boolean(clientId)))]

  await Promise.all(
    uniqueClientIds.map(async (clientId) => {
      const cancelledAppointmentCount = await db.appointment.count({
        where: {
          clientId,
          status: {
            in: [...CLIENT_CANCELLED_APPOINTMENT_STATUSES]
          }
        }
      })

      await db.client.update({
        where: { id: clientId },
        data: { cancelledAppointmentCount }
      })
    })
  )
}
