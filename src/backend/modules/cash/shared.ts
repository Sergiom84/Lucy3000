import { Prisma } from '@prisma/client'
import { prisma } from '../../db'
import { getSalePrivateCashAmount } from '../../utils/payment-breakdown'

export const PRIVATE_NO_TICKET_CASH_PIN = '0852'

type DecimalLike = Prisma.Decimal | number | string

export type CashPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

type CashRegisterBalanceSource = {
  openingBalance: DecimalLike
  movements: Array<{
    type: string
    amount: DecimalLike
    paymentMethod: string | null
  }>
}

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount)
}

export const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const getDayRange = (referenceDate: Date) => {
  const start = new Date(referenceDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(referenceDate)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export const getPeriodRange = (period: CashPeriod, referenceDate: Date) => {
  const start = new Date(referenceDate)
  const end = new Date(referenceDate)

  if (period === 'DAY') {
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  if (period === 'WEEK') {
    const day = start.getDay()
    const diff = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + diff)
    start.setHours(0, 0, 0, 0)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  if (period === 'MONTH') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setMonth(end.getMonth() + 1, 0)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  start.setMonth(0, 1)
  start.setHours(0, 0, 0, 0)
  end.setMonth(11, 31)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export const commercialSaleRangeWhere = (start: Date, end: Date): Prisma.SaleWhereInput => ({
  status: 'COMPLETED',
  date: {
    gte: start,
    lte: end
  },
  NOT: {
    paymentMethod: 'CASH',
    showInOfficialCash: false
  }
})

export const regularCommercialSaleRangeWhere = (start: Date, end: Date): Prisma.SaleWhereInput => ({
  ...commercialSaleRangeWhere(start, end),
  pendingPayment: null
})

export const topUpRangeWhere = (start: Date, end: Date): Prisma.AccountBalanceMovementWhereInput => ({
  type: 'TOP_UP',
  operationDate: {
    gte: start,
    lte: end
  }
})

export const pendingCollectionRangeWhere = (
  start: Date,
  end: Date
): Prisma.PendingPaymentCollectionWhereInput => ({
  operationDate: {
    gte: start,
    lte: end
  },
  NOT: {
    paymentMethod: 'CASH',
    showInOfficialCash: false
  }
})

export const privateCashSaleRangeWhere = (start: Date, end: Date): Prisma.SaleWhereInput => ({
  status: 'COMPLETED',
  pendingPayment: null,
  paymentMethod: 'CASH',
  showInOfficialCash: false,
  date: {
    gte: start,
    lte: end
  }
})

export const privateCashCollectionRangeWhere = (
  start: Date,
  end: Date
): Prisma.PendingPaymentCollectionWhereInput => ({
  paymentMethod: 'CASH',
  showInOfficialCash: false,
  operationDate: {
    gte: start,
    lte: end
  }
})

const parseDenominationsJson = (raw: string | null | undefined): Record<string, number> => {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const out: Record<string, number> = {}
      for (const [key, value] of Object.entries(parsed)) {
        const num = Number(value)
        if (Number.isFinite(num) && num > 0) out[key] = Math.trunc(num)
      }
      return out
    }
  } catch {
    // ignore
  }

  return {}
}

export const getLastClosure = async () => {
  const last = await prisma.cashRegister.findFirst({
    where: { status: 'CLOSED', nextDayFloat: { not: null } },
    orderBy: { closedAt: 'desc' },
    select: {
      id: true,
      closedAt: true,
      nextDayFloat: true,
      nextDayFloatDenominations: true
    }
  })

  if (!last) return null

  return {
    id: last.id,
    closedAt: last.closedAt,
    nextDayFloat: last.nextDayFloat !== null ? Number(last.nextDayFloat) : 0,
    nextDayFloatDenominations: parseDenominationsJson(last.nextDayFloatDenominations)
  }
}

export const computeExpectedBalance = (cashRegister: CashRegisterBalanceSource) => {
  let total = Number(cashRegister.openingBalance)

  for (const movement of cashRegister.movements) {
    const amount = Number(movement.amount)
    if (movement.type === 'DEPOSIT') {
      total += amount
      continue
    }

    if (movement.type === 'EXPENSE' || movement.type === 'WITHDRAWAL') {
      total -= amount
      continue
    }

    if (movement.type === 'INCOME' && (!movement.paymentMethod || movement.paymentMethod === 'CASH')) {
      total += amount
    }
  }

  return total
}

export const getPrivateCashCollectedAmount = (
  performedSales: Array<{
    paymentMethod?: string | null
    paymentBreakdown?: string | null
    showInOfficialCash?: boolean | null
    total: DecimalLike
    accountBalanceMovements?: Array<{
      type?: string | null
      amount?: DecimalLike | null
    }>
    pendingPayment?: {
      collections?: Array<{
        paymentMethod?: string | null
        amount: DecimalLike
        showInOfficialCash?: boolean | null
      }>
    } | null
  }>,
  privateCashSales: Array<{
    paymentMethod?: string | null
    paymentBreakdown?: string | null
    showInOfficialCash?: boolean | null
    total: DecimalLike
  }>,
  privateCashCollections: Array<{
    paymentMethod?: string | null
    amount: DecimalLike
    showInOfficialCash?: boolean | null
  }>
) =>
  roundCurrency(
    performedSales.reduce((sum, sale) => sum + getSalePrivateCashAmount(sale), 0) +
      privateCashSales.reduce((sum, sale) => sum + getSalePrivateCashAmount(sale), 0) +
      privateCashCollections.reduce((sum, collection) => sum + Number(collection.amount || 0), 0)
  )

export const buildPrivateCashConcept = (items: Array<{ description?: string | null }>) => {
  const concepts = Array.from(
    new Set(
      (items || [])
        .map((item) => String(item?.description || '').trim())
        .filter(Boolean)
    )
  )

  if (concepts.length === 0) return 'Sin detalle'
  if (concepts.length === 1) return concepts[0]
  if (concepts.length === 2) return `${concepts[0]} · ${concepts[1]}`
  return `${concepts[0]} + ${concepts.length - 1} más`
}

export const buildPrivateCashPaymentDetail = (payload: {
  type: 'SALE' | 'COLLECTION'
  total?: DecimalLike
  paymentMethod?: string | null
  paymentBreakdown?: string | null
  showInOfficialCash?: boolean | null
}) => {
  if (payload.type === 'COLLECTION') {
    return 'Cobro pendiente · efectivo privado'
  }

  const privateCashAmount = getSalePrivateCashAmount({
    total: payload.total ?? 0,
    paymentMethod: payload.paymentMethod ?? null,
    paymentBreakdown: payload.paymentBreakdown ?? null,
    showInOfficialCash: payload.showInOfficialCash ?? null
  })
  const totalAmount = Number(payload.total || 0)

  if (privateCashAmount > 0 && privateCashAmount < totalAmount) {
    return 'Pago mixto · efectivo privado'
  }

  return 'Efectivo privado'
}
