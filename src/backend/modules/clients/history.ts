import { Prisma } from '@prisma/client'
import { prisma } from '../../db'

export const listClientHistoryEntries = async (clientId: string) => {
  return prisma.clientHistory.findMany({
    where: { clientId },
    orderBy: { date: 'desc' }
  })
}

export const createClientHistoryEntry = async (clientId: string, payload: Record<string, unknown>) => {
  const history = await prisma.clientHistory.create({
    data: {
      ...(payload as Prisma.ClientHistoryUncheckedCreateInput),
      clientId
    }
  })

  await prisma.client.update({
    where: { id: clientId },
    data: {
      totalSpent: {
        increment: payload.amount as number
      }
    }
  })

  return history
}
