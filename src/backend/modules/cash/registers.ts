import { Prisma } from '@prisma/client'
import { Request } from 'express'
import { prisma } from '../../db'
import { buildInclusiveDateRange } from '../../utils/date-range'
import { computeCashCountTotals } from '../../utils/cashCount'
import { CashModuleError } from './errors'
import { computeExpectedBalance, formatCurrency, getLastClosure, roundCurrency } from './shared'

type OpenCashRegisterInput = {
  openingBalance?: number
  openingDenominations?: Record<string, number>
  useLastClosureFloat?: boolean
  notes?: string | null
}

type CloseCashRegisterInput = {
  closingBalance?: number
  countedTotal?: number
  countedDenominations?: Record<string, number>
  nextDayFloat?: number
  nextDayFloatDenominations?: Record<string, number>
  differenceReason?: string | null
  notes?: string | null
}

type AddCashMovementInput = {
  type: string
  paymentMethod?: string | null
  amount: number
  category: string
  description: string
  reference?: string | null
}

type UpdateOpeningBalanceInput = {
  openingBalance: number
  notes?: string | null
}

type CreateCashCountInput = {
  denominations: Record<string, number>
  isBlind?: boolean
  appliedAsClose?: boolean
  notes?: string | null
}

export const getCashRegistersData = async (query: Request['query'] | undefined) => {
  const safeQuery = query || {}
  const { startDate, endDate, status } = safeQuery

  const where: Prisma.CashRegisterWhereInput = {}

  if (startDate && endDate) {
    where.date = buildInclusiveDateRange(startDate as string, endDate as string)
  }

  if (status) {
    where.status = status as string
  }

  return prisma.cashRegister.findMany({
    where,
    include: {
      movements: {
        include: {
          user: {
            select: { name: true }
          }
        },
        orderBy: { date: 'desc' }
      }
    },
    orderBy: { date: 'desc' }
  })
}

export const getCashRegisterByIdData = async (id: string) => {
  const cashRegister = await prisma.cashRegister.findUnique({
    where: { id },
    include: {
      movements: {
        include: {
          user: {
            select: { name: true }
          }
        },
        orderBy: { date: 'desc' }
      }
    }
  })

  if (!cashRegister) {
    throw new CashModuleError(404, 'Cash register not found')
  }

  return cashRegister
}

export const openCashRegisterData = async (input: OpenCashRegisterInput) => {
  const { openingBalance, openingDenominations, useLastClosureFloat, notes } = input

  const activeCashRegister = await prisma.cashRegister.findFirst({
    where: { status: 'OPEN' }
  })

  if (activeCashRegister) {
    throw new CashModuleError(400, 'There is already an open cash register')
  }

  let resolvedOpeningBalance = openingBalance
  let resolvedOpeningDenominations = openingDenominations

  if (useLastClosureFloat) {
    const lastClosure = await getLastClosure()
    if (!lastClosure) {
      throw new CashModuleError(400, 'No previous closure with next day float available')
    }

    resolvedOpeningBalance = lastClosure.nextDayFloat
    resolvedOpeningDenominations = lastClosure.nextDayFloatDenominations
  }

  if (typeof resolvedOpeningBalance !== 'number') {
    throw new CashModuleError(400, 'openingBalance is required')
  }

  return prisma.cashRegister.create({
    data: {
      openingBalance: resolvedOpeningBalance,
      openingDenominations:
        resolvedOpeningDenominations && Object.keys(resolvedOpeningDenominations).length > 0
          ? JSON.stringify(resolvedOpeningDenominations)
          : null,
      notes: notes ?? null
    },
    include: {
      movements: {
        include: {
          user: {
            select: { name: true }
          }
        }
      }
    }
  })
}

export const closeCashRegisterData = async (
  id: string,
  input: CloseCashRegisterInput,
  userId?: string
) => {
  const {
    closingBalance,
    countedTotal,
    countedDenominations,
    nextDayFloat,
    nextDayFloatDenominations,
    differenceReason,
    notes
  } = input

  const cashRegister = await prisma.cashRegister.findUnique({
    where: { id },
    include: {
      movements: true
    }
  })

  if (!cashRegister) {
    throw new CashModuleError(404, 'Cash register not found')
  }

  if (cashRegister.status === 'CLOSED') {
    throw new CashModuleError(400, 'Cash register is already closed')
  }

  const expectedBalance = computeExpectedBalance(cashRegister)
  const hasCountDetail = typeof countedTotal === 'number'

  let normalizedCountedDenominations: Record<string, number> | null = null
  let finalCountedTotal = hasCountDetail ? Number(countedTotal) : Number(closingBalance ?? 0)

  if (countedDenominations) {
    const { countedTotal: denomTotal, normalizedDenominations } = computeCashCountTotals(
      countedDenominations,
      expectedBalance
    )
    normalizedCountedDenominations = normalizedDenominations

    if (hasCountDetail && Math.abs(denomTotal - Number(countedTotal)) > 0.01) {
      throw new CashModuleError(400, {
        error: 'countedDenominations do not match countedTotal',
        expected: Number(countedTotal),
        computed: denomTotal
      })
    }

    if (!hasCountDetail) {
      finalCountedTotal = denomTotal
    }
  }

  let normalizedNextDayDenominations: Record<string, number> | null = null
  let finalNextDayFloat = typeof nextDayFloat === 'number' ? Number(nextDayFloat) : 0

  if (nextDayFloatDenominations) {
    const { countedTotal: denomTotal, normalizedDenominations } = computeCashCountTotals(
      nextDayFloatDenominations,
      0
    )
    normalizedNextDayDenominations = normalizedDenominations

    if (typeof nextDayFloat === 'number' && Math.abs(denomTotal - Number(nextDayFloat)) > 0.01) {
      throw new CashModuleError(400, {
        error: 'nextDayFloatDenominations do not match nextDayFloat',
        expected: Number(nextDayFloat),
        computed: denomTotal
      })
    }

    if (typeof nextDayFloat !== 'number') {
      finalNextDayFloat = denomTotal
    }
  }

  if (finalNextDayFloat > finalCountedTotal + 0.01) {
    throw new CashModuleError(400, {
      error: 'nextDayFloat cannot be greater than counted cash',
      countedTotal: finalCountedTotal,
      nextDayFloat: finalNextDayFloat
    })
  }

  const arqueoDifference = roundCurrency(finalCountedTotal - expectedBalance)
  const withdrawalAmount = roundCurrency(Math.max(0, finalCountedTotal - finalNextDayFloat))
  const legacyDifference = arqueoDifference

  const combinedNotes = (() => {
    const parts: string[] = []
    if (notes) parts.push(String(notes).trim())
    if (differenceReason) parts.push(`Motivo descuadre: ${String(differenceReason).trim()}`)
    return parts.filter(Boolean).join(' | ') || null
  })()

  const now = new Date()

  return prisma.$transaction(async (tx) => {
    if (withdrawalAmount > 0 && userId) {
      await tx.cashMovement.create({
        data: {
          cashRegisterId: id,
          userId,
          type: 'WITHDRAWAL',
          paymentMethod: null,
          amount: withdrawalAmount,
          category: 'Retirada de cierre',
          description: 'Retirada automática al establecer cambio para el día siguiente',
          reference: `Fondo próximo día: ${formatCurrency(finalNextDayFloat)}`,
          date: now
        }
      })
    }

    return tx.cashRegister.update({
      where: { id },
      data: {
        closingBalance: finalNextDayFloat,
        expectedBalance,
        difference: legacyDifference,
        countedTotal: finalCountedTotal,
        countedDenominations: normalizedCountedDenominations
          ? JSON.stringify(normalizedCountedDenominations)
          : null,
        arqueoDifference,
        nextDayFloat: finalNextDayFloat,
        nextDayFloatDenominations: normalizedNextDayDenominations
          ? JSON.stringify(normalizedNextDayDenominations)
          : null,
        withdrawalAmount,
        status: 'CLOSED',
        closedAt: now,
        notes: combinedNotes
      }
    })
  })
}

export const addCashMovementData = async (id: string, userId: string, input: AddCashMovementInput) => {
  const { type, paymentMethod, amount, category, description, reference } = input

  const cashRegister = await prisma.cashRegister.findUnique({
    where: { id }
  })

  if (!cashRegister) {
    throw new CashModuleError(404, 'Cash register not found')
  }

  if (cashRegister.status === 'CLOSED') {
    throw new CashModuleError(400, 'Cannot add movements to a closed cash register')
  }

  return prisma.cashMovement.create({
    data: {
      cashRegisterId: id,
      userId,
      type,
      paymentMethod: paymentMethod || null,
      amount,
      category,
      description,
      reference
    },
    include: {
      user: {
        select: { name: true }
      }
    }
  })
}

export const getCashMovementsData = async (id: string) => {
  return prisma.cashMovement.findMany({
    where: { cashRegisterId: id },
    include: {
      user: {
        select: { name: true }
      }
    },
    orderBy: { date: 'desc' }
  })
}

export const updateOpeningBalanceData = async (
  id: string,
  userId: string,
  input: UpdateOpeningBalanceInput
) => {
  const { openingBalance } = input

  const cashRegister = await prisma.cashRegister.findUnique({
    where: { id },
    include: {
      movements: true
    }
  })

  if (!cashRegister) {
    throw new CashModuleError(404, 'Cash register not found')
  }

  if (cashRegister.status === 'CLOSED') {
    throw new CashModuleError(400, 'Cannot modify opening balance of a closed cash register')
  }

  const oldOpeningBalance = Number(cashRegister.openingBalance)
  const newOpeningBalance = Number(openingBalance)
  const difference = newOpeningBalance - oldOpeningBalance

  const updatedCashRegister = await prisma.cashRegister.update({
    where: { id },
    data: {
      openingBalance: newOpeningBalance
    }
  })

  if (difference !== 0) {
    await prisma.cashMovement.create({
      data: {
        cashRegisterId: id,
        userId,
        type: difference > 0 ? 'INCOME' : 'EXPENSE',
        paymentMethod: null,
        amount: Math.abs(difference),
        category: 'Ajuste de saldo inicial',
        description: `Ajuste de saldo inicial: ${formatCurrency(oldOpeningBalance)} → ${formatCurrency(newOpeningBalance)}`,
        reference: `Diferencia: ${difference > 0 ? '+' : ''}${formatCurrency(difference)}`
      }
    })
  }

  return updatedCashRegister
}

export const createCashCountData = async (
  id: string,
  userId: string,
  input: CreateCashCountInput
) => {
  const { denominations, isBlind, appliedAsClose, notes } = input

  const cashRegister = await prisma.cashRegister.findUnique({
    where: { id },
    include: { movements: true }
  })

  if (!cashRegister) {
    throw new CashModuleError(404, 'Cash register not found')
  }

  if (cashRegister.status === 'CLOSED' && !appliedAsClose) {
    throw new CashModuleError(400, 'Cannot create cash count for a closed register')
  }

  const expectedTotal = computeExpectedBalance(cashRegister)
  const { countedTotal, difference, normalizedDenominations } = computeCashCountTotals(
    denominations || {},
    expectedTotal
  )

  const created = await prisma.cashCount.create({
    data: {
      cashRegisterId: id,
      userId,
      expectedTotal,
      countedTotal,
      difference,
      denominations: JSON.stringify(normalizedDenominations),
      isBlind: Boolean(isBlind),
      appliedAsClose: Boolean(appliedAsClose),
      notes: notes || null
    },
    include: {
      user: { select: { name: true } }
    }
  })

  return {
    ...created,
    denominations: normalizedDenominations
  }
}

export const listCashCountsData = async (id: string, limit: number) => {
  const counts = await prisma.cashCount.findMany({
    where: { cashRegisterId: id },
    include: {
      user: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  })

  return counts.map((count) => {
    let denominations: Record<string, number> = {}
    try {
      denominations = JSON.parse(count.denominations)
    } catch {
      denominations = {}
    }

    return { ...count, denominations }
  })
}
