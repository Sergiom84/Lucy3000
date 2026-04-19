import { Prisma } from '@prisma/client'

export const COMMERCIAL_PAYMENT_METHODS = ['CASH', 'CARD', 'BIZUM', 'ABONO'] as const
export type CommercialPaymentMethod = (typeof COMMERCIAL_PAYMENT_METHODS)[number]

export const TOP_UP_PAYMENT_METHODS = ['CASH', 'CARD', 'BIZUM'] as const
export type TopUpPaymentMethod = (typeof TOP_UP_PAYMENT_METHODS)[number]

type SaleLike = {
  paymentMethod?: string | null
  paymentBreakdown?: string | null
  showInOfficialCash?: boolean | null
  total: number | string | Prisma.Decimal
  accountBalanceMovements?: Array<{
    type?: string | null
    amount?: number | string | Prisma.Decimal | null
  }>
  pendingPayment?: {
    collections?: Array<PendingCollectionLike>
  } | null
}

type TopUpLike = {
  type?: string | null
  paymentMethod?: string | null
  amount: number | string | Prisma.Decimal
}

type PendingCollectionLike = {
  paymentMethod?: string | null
  amount: number | string | Prisma.Decimal
  showInOfficialCash?: boolean | null
}

type StoredPaymentBreakdownLike = {
  paymentMethod?: string | null
  amount?: number | string | Prisma.Decimal | null
  showInOfficialCash?: boolean | null
}

type StoredPaymentBreakdownEntry = {
  method: CommercialPaymentMethod
  amount: number
  showInOfficialCash: boolean
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const toNumber = (value: number | string | Prisma.Decimal | null | undefined) => Number(value || 0)
const toCents = (value: number) => Math.round(roundCurrency(value) * 100)
const fromCents = (value: number) => roundCurrency(value / 100)

const parseStoredPaymentBreakdown = (paymentBreakdown?: string | null) => {
  if (!paymentBreakdown) {
    return [] as StoredPaymentBreakdownEntry[]
  }

  try {
    const parsed = JSON.parse(paymentBreakdown)
    if (!Array.isArray(parsed)) {
      return [] as StoredPaymentBreakdownEntry[]
    }

    return parsed.reduce<StoredPaymentBreakdownEntry[]>((entries, item) => {
      const row = item as StoredPaymentBreakdownLike
      const method = normalizeCommercialSalePaymentMethod(row.paymentMethod)
      const amount = roundCurrency(toNumber(row.amount))

      if (!method || amount <= 0) {
        return entries
      }

      entries.push({
        method,
        amount,
        showInOfficialCash: method === 'CASH' ? row.showInOfficialCash !== false : true
      })
      return entries
    }, [])
  } catch {
    return [] as StoredPaymentBreakdownEntry[]
  }
}

const isOfficialCommercialEntry = (entry: StoredPaymentBreakdownEntry) =>
  !(entry.method === 'CASH' && entry.showInOfficialCash === false)

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
  const breakdown = getSalePaymentBreakdown(sale)
  if (breakdown.length > 0) {
    return roundCurrency(
      breakdown.reduce((sum, entry) => sum + (entry.method === 'ABONO' ? 0 : entry.amount), 0)
    )
  }

  const total = roundCurrency(toNumber(sale.total))
  const abonoAmount = Math.min(total, Math.max(0, getSaleAccountBalanceAmount(sale)))
  return roundCurrency(Math.max(0, total - abonoAmount))
}

export const getSalePaymentBreakdown = (sale: SaleLike) => {
  const storedEntries = parseStoredPaymentBreakdown(sale.paymentBreakdown)
  if (storedEntries.length > 0) {
    return storedEntries
      .filter((entry) => isOfficialCommercialEntry(entry))
      .map(({ method, amount }) => ({ method, amount }))
  }

  const collectionEntries = Array.isArray(sale.pendingPayment?.collections)
    ? sale.pendingPayment.collections
        .map((collection) => getPendingCollectionEntry(collection))
        .filter((entry): entry is { method: CommercialPaymentMethod; amount: number } => Boolean(entry))
    : []

  if (collectionEntries.length > 0) {
    return collectionEntries
  }

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

export const getSalePrivateCashAmount = (sale: SaleLike) => {
  const storedEntries = parseStoredPaymentBreakdown(sale.paymentBreakdown)
  if (storedEntries.length > 0) {
    return roundCurrency(
      storedEntries.reduce((sum, entry) => {
        if (entry.method !== 'CASH' || entry.showInOfficialCash !== false) {
          return sum
        }

        return sum + entry.amount
      }, 0)
    )
  }

  const paymentMethod = normalizeCommercialSalePaymentMethod(sale.paymentMethod)
  if (paymentMethod === 'CASH' && sale.showInOfficialCash === false) {
    return roundCurrency(toNumber(sale.total))
  }

  return 0
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

export const getPendingCollectionEntry = (collection: PendingCollectionLike) => {
  const paymentMethod = normalizeCommercialSalePaymentMethod(collection.paymentMethod)
  if (!paymentMethod) {
    return null
  }

  if (paymentMethod === 'CASH' && collection.showInOfficialCash === false) {
    return null
  }

  const amount = roundCurrency(toNumber(collection.amount))
  if (amount <= 0) {
    return null
  }

  return {
    method: paymentMethod,
    amount
  }
}

export const getPendingCollectionCollectedAmount = (collection: PendingCollectionLike) => {
  const entry = getPendingCollectionEntry(collection)
  if (!entry || entry.method === 'ABONO') {
    return 0
  }

  return entry.amount
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
