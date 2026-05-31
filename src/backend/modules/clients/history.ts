import { Prisma } from '@prisma/client'
import { prisma } from '../../db'
import { ClientModuleError } from './errors'

export const listClientHistoryEntries = async (clientId: string) => {
  return prisma.clientHistory.findMany({
    where: { clientId },
    orderBy: { date: 'desc' }
  })
}

export const createClientHistoryEntry = async (clientId: string, payload: Record<string, unknown>) => {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: { id: true }
    })

    if (!client) {
      throw new ClientModuleError(404, 'Client not found')
    }

    const history = await tx.clientHistory.create({
      data: {
        ...(payload as Prisma.ClientHistoryUncheckedCreateInput),
        clientId
      }
    })

    await tx.client.update({
      where: { id: clientId },
      data: {
        totalSpent: {
          increment: payload.amount as number
        }
      }
    })

    return history
  })
}
