import { Prisma } from '@prisma/client'
import { prisma } from '../../db'
import { normalizeTopUpPaymentMethod } from '../../utils/payment-breakdown'
import { AccountBalanceError } from './errors'

const toNumber = (value: unknown) => Number(value || 0)
const normalizeMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const ACCOUNT_BALANCE_IMPORT_SOURCE = 'LEGACY_ACCOUNT_BALANCE'

export type PreparedAccountBalanceRow = {
  row: number
  message: string
  clientId: string
  legacyRef: string
  description: string
  amount: number
  operationDate: Date
  notes: string | null
}

type SerializableAccountBalanceMovement = {
  id: string
  clientId: string
  saleId: string | null
  type: string
  paymentMethod?: string | null
  operationDate: Date
  description: string
  referenceItem: string | null
  amount: Prisma.Decimal | number
  balanceAfter: Prisma.Decimal | number
  notes: string | null
  createdAt: Date
}

export const serializeAccountBalanceMovement = (movement: SerializableAccountBalanceMovement) => ({
  ...movement,
  amount: toNumber(movement.amount),
  balanceAfter: toNumber(movement.balanceAfter)
})

export const persistImportedAccountBalance = async (row: PreparedAccountBalanceRow) =>
  prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: row.clientId },
      select: { id: true, accountBalance: true }
    })

    if (!client) {
      throw new AccountBalanceError(404, 'Client not found')
    }

    const currentBalance = toNumber(client.accountBalance)
    const nextBalance = normalizeMoney(currentBalance + row.amount)

    await tx.client.update({
      where: { id: row.clientId },
      data: { accountBalance: nextBalance }
    })

    await tx.accountBalanceMovement.create({
      data: {
        clientId: row.clientId,
        type: 'TOP_UP',
        paymentMethod: null,
        operationDate: row.operationDate,
        description: row.description,
        referenceItem: null,
        legacyRef: row.legacyRef,
        importSource: ACCOUNT_BALANCE_IMPORT_SOURCE,
        amount: row.amount,
        balanceAfter: nextBalance,
        notes: row.notes
      }
    })
  })

export const getClientAccountBalanceHistory = async (clientId: string, limit: number) => {
  const [client, movements] = await prisma.$transaction([
    prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        accountBalance: true
      }
    }),
    prisma.accountBalanceMovement.findMany({
      where: { clientId },
      orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }],
      take: limit
    })
  ])

  if (!client) {
    throw new AccountBalanceError(404, 'Client not found')
  }

  return {
    clientId: client.id,
    currentBalance: toNumber(client.accountBalance),
    movements: movements.map(serializeAccountBalanceMovement)
  }
}

export const getGlobalAccountBalanceHistory = async (limit: number) => {
  const movements = await prisma.accountBalanceMovement.findMany({
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },
      sale: {
        select: {
          id: true,
          saleNumber: true,
          paymentMethod: true,
          paymentBreakdown: true,
          status: true,
          pendingPayment: {
            select: {
              collections: {
                select: {
                  amount: true,
                  paymentMethod: true,
                  showInOfficialCash: true,
                  operationDate: true,
                  createdAt: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }],
    take: limit
  })

  return {
    movements: movements.map((movement) => ({
      ...serializeAccountBalanceMovement(movement),
      client: movement.client,
      sale: movement.sale
    }))
  }
}

export const createAccountBalanceTopUp = async (payload: {
  clientId: string
  userId?: string | null
  description: unknown
  amount: unknown
  paymentMethod: unknown
  operationDate?: unknown
  notes?: string | null
}) => {
  const parsedAmount = Number(payload.amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new AccountBalanceError(400, 'Amount must be greater than zero')
  }

  const normalizedPaymentMethod = normalizeTopUpPaymentMethod(String(payload.paymentMethod ?? ''))
  if (!normalizedPaymentMethod) {
    throw new AccountBalanceError(400, 'Invalid payment method for top-up')
  }

  if (!payload.userId) {
    throw new AccountBalanceError(401, 'Unauthorized')
  }
  const userId = String(payload.userId)

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: payload.clientId },
      select: { id: true, firstName: true, lastName: true, accountBalance: true }
    })

    if (!client) {
      throw new AccountBalanceError(404, 'Client not found')
    }

    const currentBalance = toNumber(client.accountBalance)
    const nextBalance = normalizeMoney(currentBalance + parsedAmount)
    const operationAt = payload.operationDate ? new Date(String(payload.operationDate)) : new Date()

    await tx.client.update({
      where: { id: payload.clientId },
      data: { accountBalance: nextBalance }
    })

    const movement = await tx.accountBalanceMovement.create({
      data: {
        clientId: payload.clientId,
        type: 'TOP_UP',
        paymentMethod: normalizedPaymentMethod,
        operationDate: operationAt,
        description: String(payload.description).trim(),
        referenceItem: null,
        amount: parsedAmount,
        balanceAfter: nextBalance,
        notes: payload.notes || null
      } as Prisma.AccountBalanceMovementUncheckedCreateInput
    })

    const openCashRegister = await tx.cashRegister.findFirst({
      where: { status: 'OPEN' },
      select: { id: true }
    })

    if (openCashRegister) {
      await tx.cashMovement.create({
        data: {
          cashRegisterId: openCashRegister.id,
          userId,
          type: 'INCOME',
          paymentMethod: normalizedPaymentMethod,
          amount: parsedAmount,
          category: 'Abonos',
          description: `Recarga de abono · ${client.firstName} ${client.lastName}`.trim(),
          reference: String(payload.description).trim(),
          date: operationAt
        }
      })
    }

    return {
      currentBalance: nextBalance,
      movement: serializeAccountBalanceMovement(movement)
    }
  })
}

export const consumeAccountBalance = async (payload: {
  clientId: string
  operationDate?: unknown
  referenceItem: unknown
  amount: unknown
  notes?: string | null
  saleId?: string | null
  description?: unknown
}) => {
  const parsedAmount = Number(payload.amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new AccountBalanceError(400, 'Amount must be greater than zero')
  }

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: payload.clientId },
      select: { id: true, accountBalance: true }
    })

    if (!client) {
      throw new AccountBalanceError(404, 'Client not found')
    }

    const currentBalance = toNumber(client.accountBalance)
    if (currentBalance < parsedAmount) {
      throw new AccountBalanceError(400, 'Insufficient account balance')
    }

    const nextBalance = normalizeMoney(currentBalance - parsedAmount)

    await tx.client.update({
      where: { id: payload.clientId },
      data: { accountBalance: nextBalance }
    })

    const movement = await tx.accountBalanceMovement.create({
      data: {
        clientId: payload.clientId,
        saleId: payload.saleId || null,
        type: 'CONSUMPTION',
        operationDate: payload.operationDate ? new Date(String(payload.operationDate)) : new Date(),
        description: String(payload.description || 'Consumo de abono').trim(),
        referenceItem: String(payload.referenceItem).trim(),
        amount: parsedAmount,
        balanceAfter: nextBalance,
        notes: payload.notes || null
      }
    })

    return {
      currentBalance: nextBalance,
      movement: serializeAccountBalanceMovement(movement)
    }
  })
}

export const updateAccountBalance = async (payload: {
  clientId: string
  accountBalance: unknown
}) => {
  const nextBalance =
    payload.accountBalance !== null && payload.accountBalance !== undefined ? Number(payload.accountBalance) : 0

  if (!Number.isFinite(nextBalance) || nextBalance < 0) {
    throw new AccountBalanceError(400, 'accountBalance must be a valid number >= 0')
  }

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: payload.clientId },
      select: { id: true, accountBalance: true }
    })

    if (!client) {
      throw new AccountBalanceError(404, 'Client not found')
    }

    const previousBalance = toNumber(client.accountBalance)
    const normalizedNext = normalizeMoney(nextBalance)

    const updatedClient = await tx.client.update({
      where: { id: payload.clientId },
      data: { accountBalance: normalizedNext }
    })

    if (previousBalance !== normalizedNext) {
      const difference = Math.abs(normalizedNext - previousBalance)
      await tx.accountBalanceMovement.create({
        data: {
          clientId: payload.clientId,
          type: 'ADJUSTMENT',
          operationDate: new Date(),
          description: `Ajuste manual de saldo: ${previousBalance.toFixed(2)}€ -> ${normalizedNext.toFixed(2)}€`,
          referenceItem: null,
          amount: difference,
          balanceAfter: normalizedNext,
          notes: null
        }
      })
    }

    return updatedClient
  })
}
