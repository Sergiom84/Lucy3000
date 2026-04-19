import { Prisma } from '@prisma/client'

type ClientDebtState = {
  id: string
  firstName: string
  lastName: string
  pendingAmount: Prisma.Decimal | number | null
  debtAlertEnabled: boolean
  isActive: boolean
}

type DebtDbClient = Pick<Prisma.TransactionClient, 'client' | 'notification'>

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const syncDebtNotification = async (
  db: Pick<DebtDbClient, 'notification'>,
  client: ClientDebtState
) => {
  const pendingAmount = Number(client.pendingAmount || 0)
  const title = `Cobro pendiente: ${client.firstName} ${client.lastName}`
  const shouldAlert = client.isActive && client.debtAlertEnabled && pendingAmount > 0

  if (!shouldAlert) {
    await db.notification.updateMany({
      where: {
        type: 'PENDING_DEBT',
        title,
        isRead: false
      },
      data: {
        isRead: true
      }
    })
    return
  }

  const existing = await db.notification.findFirst({
    where: {
      type: 'PENDING_DEBT',
      title,
      isRead: false
    }
  })

  const message = `El cliente tiene ${pendingAmount.toFixed(2)}€ pendientes de pago.`

  if (existing) {
    await db.notification.update({
      where: { id: existing.id },
      data: { message, priority: 'HIGH' }
    })
    return
  }

  await db.notification.create({
    data: {
      type: 'PENDING_DEBT',
      title,
      message,
      priority: 'HIGH'
    }
  })
}

export const adjustClientPendingAmount = async (
  db: DebtDbClient,
  payload: {
    clientId: string
    delta: number
    enableAlertOnPositive?: boolean
  }
) => {
  const client = await db.client.findUnique({
    where: { id: payload.clientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      pendingAmount: true,
      debtAlertEnabled: true,
      isActive: true
    }
  })

  if (!client) {
    throw new Error('Client not found')
  }

  const currentPendingAmount = Number(client.pendingAmount || 0)
  const nextPendingAmount = roundCurrency(Math.max(0, currentPendingAmount + payload.delta))
  const updatedClient = await db.client.update({
    where: { id: payload.clientId },
    data: {
      pendingAmount: nextPendingAmount,
      ...(payload.enableAlertOnPositive !== false && nextPendingAmount > 0
        ? { debtAlertEnabled: true }
        : {})
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      pendingAmount: true,
      debtAlertEnabled: true,
      isActive: true
    }
  })

  await syncDebtNotification(db, updatedClient)

  return updatedClient
}
