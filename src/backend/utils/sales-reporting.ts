import { Prisma } from '@prisma/client'
import { getSaleDisplayName } from './customer-display'
import {
  COMMERCIAL_PAYMENT_METHODS,
  CommercialPaymentMethod,
  addBreakdownEntriesToBuckets,
  allocateAmountByWeights,
  createCommercialPaymentBuckets,
  getSaleCollectedAmount,
  getSalePaymentBreakdown,
  normalizeCommercialSalePaymentMethod,
  roundQuantityShare
} from './payment-breakdown'

const PROFESSIONAL_LABELS: Record<string, string> = {
  LUCY: 'Lucy',
  TAMARA: 'Tamara',
  CHEMA: 'Chema',
  OTROS: 'Otros'
}

export const saleSummarySelect = {
  total: true,
  paymentMethod: true,
  accountBalanceMovements: {
    select: {
      type: true,
      amount: true
    }
  }
} satisfies Prisma.SaleSelect

export type SaleSummaryRecord = Prisma.SaleGetPayload<{ select: typeof saleSummarySelect }>

export const saleAnalyticsInclude = {
  user: {
    select: {
      name: true
    }
  },
  client: {
    select: {
      id: true,
      firstName: true,
      lastName: true
    }
  },
  appointment: {
    select: {
      guestName: true
    }
  },
  items: {
    include: {
      service: {
        select: {
          id: true,
          name: true
        }
      },
      product: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  accountBalanceMovements: {
    select: {
      type: true,
      amount: true
    }
  }
} satisfies Prisma.SaleInclude

export type SaleAnalyticsRecord = Prisma.SaleGetPayload<{ include: typeof saleAnalyticsInclude }>

export const accountBalanceTopUpSummarySelect = {
  type: true,
  amount: true,
  paymentMethod: true
} satisfies Prisma.AccountBalanceMovementSelect

export type AccountBalanceTopUpSummaryRecord = Prisma.AccountBalanceMovementGetPayload<{
  select: typeof accountBalanceTopUpSummarySelect
}>

export type CashAnalyticsRow = {
  saleId: string
  saleNumber: string
  date: Date
  clientId: string | null
  clientName: string
  paymentMethod: CommercialPaymentMethod
  professionalName: string
  itemType: 'SERVICE' | 'PRODUCT'
  serviceId: string | null
  productId: string | null
  concept: string
  quantity: number
  amount: number
}

type AnalyticsFilters = {
  paymentMethod?: string
  serviceId?: string
  productId?: string
  type?: 'ALL' | 'SERVICE' | 'PRODUCT'
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const formatProfessionalName = (professional?: string | null, fallbackUserName?: string | null) => {
  const normalizedProfessional = String(professional || '').trim()
  if (normalizedProfessional) {
    return PROFESSIONAL_LABELS[normalizedProfessional.toUpperCase()] || normalizedProfessional
  }

  const normalizedUserName = String(fallbackUserName || '').trim()
  return normalizedUserName || 'Sin profesional'
}

export const buildCommercialPaymentMethodTotals = (sales: Array<SaleSummaryRecord>) => {
  const buckets = createCommercialPaymentBuckets()

  for (const sale of sales) {
    addBreakdownEntriesToBuckets(buckets, getSalePaymentBreakdown(sale))
  }

  return buckets
}

export const buildCommercialPaymentMethodResponse = (sales: Array<SaleSummaryRecord>) => {
  const buckets = buildCommercialPaymentMethodTotals(sales)

  return COMMERCIAL_PAYMENT_METHODS.reduce<Record<CommercialPaymentMethod, number>>((acc, method) => {
    acc[method] = roundCurrency(buckets[method] || 0)
    return acc
  }, createCommercialPaymentBuckets())
}

export const getCollectedRevenue = (sales: Array<SaleSummaryRecord>) =>
  roundCurrency(sales.reduce((sum, sale) => sum + getSaleCollectedAmount(sale), 0))

export const getWorkPerformedRevenue = (sales: Array<SaleSummaryRecord>) =>
  roundCurrency(sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0))

export const buildSaleAnalyticsRows = (
  sales: Array<SaleAnalyticsRecord>,
  filters: AnalyticsFilters = {}
): CashAnalyticsRow[] => {
  const normalizedPaymentMethod = normalizeCommercialSalePaymentMethod(filters.paymentMethod)
  const rows: CashAnalyticsRow[] = []

  for (const sale of sales) {
    const breakdown = getSalePaymentBreakdown(sale)
    if (breakdown.length === 0 || sale.items.length === 0) continue

    const itemWeights = sale.items.map((item) => Number(item.subtotal || 0))
    const allocatedItemAmounts = allocateAmountByWeights(Number(sale.total || 0), itemWeights)
    const breakdownWeights = breakdown.map((entry) => entry.amount)
    const totalBreakdownAmount = breakdownWeights.reduce((sum, entryAmount) => sum + entryAmount, 0)

    for (let index = 0; index < sale.items.length; index += 1) {
      const item = sale.items[index]
      const itemAmount = Number(allocatedItemAmounts[index] || 0)
      if (itemAmount <= 0) continue

      const splitAmounts = allocateAmountByWeights(itemAmount, breakdownWeights)

      for (let breakdownIndex = 0; breakdownIndex < breakdown.length; breakdownIndex += 1) {
        const breakdownEntry = breakdown[breakdownIndex]
        const amount = Number(splitAmounts[breakdownIndex] || 0)
        if (amount <= 0) continue

        const quantityShare =
          totalBreakdownAmount > 0
            ? roundQuantityShare((item.quantity || 0) * (breakdownEntry.amount / totalBreakdownAmount))
            : item.quantity || 0

        rows.push({
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          date: sale.date,
          clientId: sale.clientId,
          clientName: getSaleDisplayName(sale),
          paymentMethod: breakdownEntry.method,
          professionalName: formatProfessionalName(sale.professional, sale.user?.name),
          itemType: item.serviceId ? 'SERVICE' : 'PRODUCT',
          serviceId: item.serviceId,
          productId: item.productId,
          concept: item.service?.name || item.product?.name || item.description,
          quantity: quantityShare,
          amount: roundCurrency(amount)
        })
      }
    }
  }

  return rows.filter((row) => {
    if (normalizedPaymentMethod && row.paymentMethod !== normalizedPaymentMethod) {
      return false
    }

    if (filters.type === 'SERVICE' && row.itemType !== 'SERVICE') {
      return false
    }

    if (filters.type === 'PRODUCT' && row.itemType !== 'PRODUCT') {
      return false
    }

    if (filters.serviceId && row.serviceId !== filters.serviceId) {
      return false
    }

    if (filters.productId && row.productId !== filters.productId) {
      return false
    }

    return true
  })
}

export const buildTopProducts = (sales: Array<SaleAnalyticsRecord>) => {
  const productSales: Record<string, number> = {}

  for (const sale of sales) {
    for (const item of sale.items) {
      if (!item.productId) continue
      productSales[item.description] = (productSales[item.description] || 0) + item.quantity
    }
  }

  return Object.entries(productSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, quantity]) => ({ name, quantity }))
}
