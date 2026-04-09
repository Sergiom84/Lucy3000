import { Prisma } from '@prisma/client'

export const COMMERCIAL_PAYMENT_METHODS = ['CASH', 'CARD', 'BIZUM', 'ABONO'] as const
export type CommercialPaymentMethod = (typeof COMMERCIAL_PAYMENT_METHODS)[number]

export const TOP_UP_PAYMENT_METHODS = ['CASH', 'CARD', 'BIZUM'] as const
export type TopUpPaymentMethod = (typeof TOP_UP_PAYMENT_METHODS)[number]

type SaleLike = {
  paymentMethod?: string | null
  total: number | string | Prisma.Decimal
  accountBalanceMovements?: Array<{
    type?: string | null
    amount?: number | string | Prisma.Decimal | null
  }>
}

type TopUpLike = {
  type?: string | null
  paymentMethod?: string | null
  amount: number | string | Prisma.Decimal
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const toNumber = (value: number | string | Prisma.Decimal | null | undefined) => Number(value || 0)
const toCents = (value: number) => Math.round(roundCurrency(value) * 100)
const fromCents = (value: number) => roundCurrency(value / 100)

export const createCommercialPaymentBuckets = () =>
  COMMERCIAL_PAYMENT_METHODS.reduce<Record<CommercialPaymentMethod, number>>((acc, method) => {
    acc[method] = 0
    return acc
  }, {} as Record<CommercialPaymentMethod, number>)

export const normalizeCommercialSalePaymentMethod = (
  paymentMethod?: string | null
): CommercialPaymentMethod | null => {
  const normalized = String(paymentMethod || '').trim().toUpperCase()

  if (normalized === 'CASH' || normalized === 'CARD' || normalized === 'BIZUM') {
    return normalized as CommercialPaymentMethod
  }

  if (normalized === 'ABONO' || normalized === 'OTHER') {
    return 'ABONO'
  }

  return null
}

export const normalizeTopUpPaymentMethod = (paymentMethod?: string | null): TopUpPaymentMethod | null => {
  const normalized = String(paymentMethod || '').trim().toUpperCase()

  if (normalized === 'CASH' || normalized === 'CARD' || normalized === 'BIZUM') {
    return normalized as TopUpPaymentMethod
  }

  return null
}

export const getSaleAccountBalanceAmount = (sale: SaleLike) =>
  roundCurrency(
    (sale.accountBalanceMovements || []).reduce((sum, movement) => {
      if (String(movement?.type || '').toUpperCase() !== 'CONSUMPTION') {
        return sum
      }

      return sum + toNumber(movement?.amount)
    }, 0)
  )

export const getSaleCollectedAmount = (sale: SaleLike) => {
  const total = roundCurrency(toNumber(sale.total))
  const abonoAmount = Math.min(total, Math.max(0, getSaleAccountBalanceAmount(sale)))
  return roundCurrency(Math.max(0, total - abonoAmount))
}

export const getSalePaymentBreakdown = (sale: SaleLike) => {
  const total = roundCurrency(toNumber(sale.total))
  const normalizedMethod = normalizeCommercialSalePaymentMethod(sale.paymentMethod)
  const abonoAmount = Math.min(total, Math.max(0, getSaleAccountBalanceAmount(sale)))
  const collectedAmount = roundCurrency(Math.max(0, total - abonoAmount))
  const entries: Array<{ method: CommercialPaymentMethod; amount: number }> = []

  if (abonoAmount > 0) {
    entries.push({ method: 'ABONO', amount: abonoAmount })
  }

  if (collectedAmount > 0) {
    const realMethod = normalizedMethod && normalizedMethod !== 'ABONO' ? normalizedMethod : null
    if (realMethod) {
      entries.push({ method: realMethod, amount: collectedAmount })
    }
  }

  if (entries.length === 0 && total > 0 && normalizedMethod) {
    entries.push({ method: normalizedMethod, amount: total })
  }

  return entries
}

export const getTopUpCollectedEntry = (movement: TopUpLike) => {
  if (String(movement?.type || '').toUpperCase() !== 'TOP_UP') {
    return null
  }

  const paymentMethod = normalizeTopUpPaymentMethod(movement.paymentMethod)
  if (!paymentMethod) {
    return null
  }

  const amount = roundCurrency(toNumber(movement.amount))
  if (amount <= 0) {
    return null
  }

  return {
    method: paymentMethod,
    amount
  }
}

export const addBreakdownEntriesToBuckets = (
  buckets: Record<CommercialPaymentMethod, number>,
  entries: Array<{ method: CommercialPaymentMethod; amount: number }>
) => {
  for (const entry of entries) {
    buckets[entry.method] = roundCurrency((buckets[entry.method] || 0) + roundCurrency(entry.amount))
  }
}

export const allocateAmountByWeights = (totalAmount: number, weights: number[]) => {
  const totalCents = toCents(totalAmount)
  const weightCents = weights.map((weight) => Math.max(0, toCents(weight)))
  const totalWeight = weightCents.reduce((sum, weight) => sum + weight, 0)

  if (weightCents.length === 0) return [] as number[]

  if (totalCents <= 0 || totalWeight <= 0) {
    return weightCents.map(() => 0)
  }

  let remaining = totalCents

  return weightCents.map((weight, index) => {
    if (index === weightCents.length - 1) {
      return fromCents(Math.max(0, remaining))
    }

    const allocated = Math.min(remaining, Math.max(0, Math.round((totalCents * weight) / totalWeight)))
    remaining -= allocated
    return fromCents(allocated)
  })
}

export const roundQuantityShare = (value: number) =>
  Math.round((value + Number.EPSILON) * 1000) / 1000
