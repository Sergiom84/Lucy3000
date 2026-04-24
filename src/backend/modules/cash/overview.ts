import { Prisma } from '@prisma/client'
import { Request } from 'express'
import { prisma } from '../../db'
import {
  addBreakdownEntriesToBuckets,
  createCommercialPaymentBuckets,
  getPendingCollectionEntry,
  getTopUpCollectedEntry
} from '../../utils/payment-breakdown'
import { getAnalyticsRows, resolveAnalyticsRange } from './analytics'
import {
  CashPeriod,
  commercialSaleRangeWhere,
  computeExpectedBalance,
  pendingCollectionRangeWhere,
  roundCurrency,
  topUpRangeWhere
} from './shared'

type OverviewSalesRow = {
  id: string
  description: string
  itemType: 'SERVICE' | 'PRODUCT'
  quantity: number
  amount: number
}

type OverviewProfessionalRow = {
  name: string
  services: number
  amount: number
}

const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000

const buildCashOverviewItemFilter = (
  query: Request['query'] | undefined
): { itemFilter: Prisma.SaleItemWhereInput; hasItemFilter: boolean } => {
  const safeQuery = query || {}
  const serviceId = safeQuery.serviceId as string | undefined
  const productId = safeQuery.productId as string | undefined
  const type = (safeQuery.type as 'ALL' | 'SERVICE' | 'PRODUCT' | undefined) || 'ALL'
  const itemFilter: Prisma.SaleItemWhereInput = {}

  if (serviceId) itemFilter.serviceId = serviceId
  if (productId) itemFilter.productId = productId
  if (type === 'SERVICE') itemFilter.serviceId = { not: null }
  if (type === 'PRODUCT') itemFilter.productId = { not: null }

  return {
    itemFilter,
    hasItemFilter: Boolean(serviceId || productId || type !== 'ALL')
  }
}

const buildCashOverviewSaleWhere = (
  start: Date,
  end: Date,
  query: Request['query'] | undefined
): Prisma.SaleWhereInput => {
  const safeQuery = query || {}
  const clientId = safeQuery.clientId as string | undefined
  const { itemFilter, hasItemFilter } = buildCashOverviewItemFilter(safeQuery)

  return {
    ...commercialSaleRangeWhere(start, end),
    ...(clientId ? { clientId } : {}),
    ...(hasItemFilter ? { items: { some: itemFilter } } : {})
  }
}

const buildCashOverviewPendingWhere = (query: Request['query'] | undefined): Prisma.PendingPaymentWhereInput => {
  const safeQuery = query || {}
  const clientId = safeQuery.clientId as string | undefined
  const { itemFilter, hasItemFilter } = buildCashOverviewItemFilter(safeQuery)

  return {
    status: 'OPEN',
    ...(clientId ? { clientId } : {}),
    ...(hasItemFilter ? { sale: { items: { some: itemFilter } } } : {})
  }
}

const buildCashOverviewBonoSessionWhere = (
  start: Date,
  end: Date,
  query: Request['query'] | undefined
): Prisma.BonoSessionWhereInput | null => {
  const safeQuery = query || {}
  const clientId = safeQuery.clientId as string | undefined
  const serviceId = safeQuery.serviceId as string | undefined
  const productId = safeQuery.productId as string | undefined
  const type = (safeQuery.type as 'ALL' | 'SERVICE' | 'PRODUCT' | undefined) || 'ALL'

  if (productId || type === 'PRODUCT') {
    return null
  }

  return {
    status: 'CONSUMED',
    consumedAt: {
      gte: start,
      lte: end
    },
    ...(clientId || serviceId
      ? {
          bonoPack: {
            ...(clientId ? { clientId } : {}),
            ...(serviceId ? { serviceId } : {})
          }
        }
      : {})
  }
}

const aggregateSalesAndServicesRows = (rows: Awaited<ReturnType<typeof getAnalyticsRows>>) => {
  const grouped = new Map<string, OverviewSalesRow>()

  for (const row of rows) {
    const key = `${row.itemType}:${row.serviceId || row.productId || row.concept}`
    const current = grouped.get(key) || {
      id: key,
      description: row.concept,
      itemType: row.itemType,
      quantity: 0,
      amount: 0
    }

    current.quantity = roundQuantity(current.quantity + Number(row.quantity || 0))
    current.amount = roundCurrency(current.amount + Number(row.amount || 0))
    grouped.set(key, current)
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.itemType !== b.itemType) return a.itemType === 'SERVICE' ? -1 : 1
    return a.description.localeCompare(b.description, 'es')
  })
}

const aggregateProfessionalRows = (rows: Awaited<ReturnType<typeof getAnalyticsRows>>) => {
  const grouped = new Map<string, OverviewProfessionalRow>()

  for (const row of rows) {
    const key = row.professionalName || 'Sin profesional'
    const current = grouped.get(key) || {
      name: key,
      services: 0,
      amount: 0
    }

    if (row.itemType === 'SERVICE') {
      current.services = roundQuantity(current.services + Number(row.quantity || 0))
    }
    current.amount = roundCurrency(current.amount + Number(row.amount || 0))
    grouped.set(key, current)
  }

  return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'))
}

export const getCashOverviewData = async (query: Request['query'] | undefined) => {
  const safeQuery = query || {}
  const { start, end } = resolveAnalyticsRange(safeQuery)
  const rows = await getAnalyticsRows(safeQuery)
  const saleWhere = buildCashOverviewSaleWhere(start, end, safeQuery)
  const pendingWhere = buildCashOverviewPendingWhere(safeQuery)
  const { hasItemFilter } = buildCashOverviewItemFilter(safeQuery)
  const bonoSessionWhere = buildCashOverviewBonoSessionWhere(start, end, safeQuery)
  const clientId = safeQuery.clientId as string | undefined

  const [
    activeCashRegister,
    sales,
    pendingCollections,
    accountBalanceTopUps,
    openPendingPayments,
    amortizedCount
  ] = await Promise.all([
    prisma.cashRegister.findFirst({
      where: { status: 'OPEN' },
      include: { movements: true },
      orderBy: { openedAt: 'desc' }
    }),
    prisma.sale.findMany({
      where: saleWhere,
      include: {
        items: {
          select: {
            quantity: true,
            subtotal: true
          }
        }
      }
    }),
    prisma.pendingPaymentCollection.findMany({
      where: {
        ...pendingCollectionRangeWhere(start, end),
        ...(clientId ? { clientId } : {}),
        ...(hasItemFilter
          ? {
              sale: {
                items: {
                  some: buildCashOverviewItemFilter(safeQuery).itemFilter
                }
              }
            }
          : {})
      },
      select: {
        amount: true,
        paymentMethod: true,
        showInOfficialCash: true
      }
    }),
    hasItemFilter
      ? Promise.resolve([])
      : prisma.accountBalanceMovement.findMany({
          where: {
            ...topUpRangeWhere(start, end),
            ...(clientId ? { clientId } : {})
          },
          select: {
            type: true,
            amount: true,
            paymentMethod: true
          }
        }),
    prisma.pendingPayment.findMany({
      where: pendingWhere,
      select: { amount: true }
    }),
    bonoSessionWhere ? prisma.bonoSession.count({ where: bonoSessionWhere }) : Promise.resolve(0)
  ])

  const paymentsByMethod = createCommercialPaymentBuckets()

  for (const row of rows) {
    addBreakdownEntriesToBuckets(paymentsByMethod, [{ method: row.paymentMethod, amount: Number(row.amount || 0) }])
  }

  for (const topUp of accountBalanceTopUps) {
    const topUpEntry = getTopUpCollectedEntry(topUp)
    if (topUpEntry) addBreakdownEntriesToBuckets(paymentsByMethod, [topUpEntry])
  }

  const billingTotal = roundCurrency(sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0))
  const accountBalanceAmount = roundCurrency(paymentsByMethod.ABONO || 0)
  const topUpsTotal = roundCurrency(
    accountBalanceTopUps.reduce((sum, topUp) => sum + Number(topUp.amount || 0), 0)
  )
  const pendingCollectionsTotal = roundCurrency(
    pendingCollections.reduce((sum, collection) => {
      const entry = getPendingCollectionEntry(collection)
      return entry ? sum + entry.amount : sum
    }, 0)
  )
  const totalCollected = roundCurrency(
    Number(paymentsByMethod.CASH || 0) + Number(paymentsByMethod.CARD || 0) + Number(paymentsByMethod.BIZUM || 0)
  )
  const openPendingTotal = roundCurrency(
    openPendingPayments.reduce((sum, pending) => sum + Number(pending.amount || 0), 0)
  )
  const withDiscounts = roundCurrency(sales.reduce((sum, sale) => sum + Number(sale.discount || 0), 0))
  const freeOfChargeCount = sales.reduce(
    (sum, sale) =>
      sum +
      sale.items.reduce(
        (itemSum, item) => itemSum + (Number(item.subtotal || 0) <= 0 ? Number(item.quantity || 0) : 0),
        0
      ),
    0
  )
  const manualMovements = activeCashRegister
    ? roundCurrency(
        activeCashRegister.movements.reduce((sum, movement) => {
          const amount = Number(movement.amount || 0)
          if (movement.type === 'DEPOSIT') return sum + amount
          if (movement.type === 'EXPENSE' || movement.type === 'WITHDRAWAL') return sum - amount
          return sum
        }, 0)
      )
    : 0
  const currentCash = activeCashRegister ? roundCurrency(computeExpectedBalance(activeCashRegister)) : 0

  const salesAndServices = aggregateSalesAndServicesRows(rows)
  const professionals = aggregateProfessionalRows(rows)
  const servicesAmount = roundCurrency(rows.reduce((sum, row) => sum + (row.itemType === 'SERVICE' ? row.amount : 0), 0))
  const productsAmount = roundCurrency(rows.reduce((sum, row) => sum + (row.itemType === 'PRODUCT' ? row.amount : 0), 0))

  return {
    range: {
      period: ((safeQuery.period as CashPeriod) || 'DAY') as CashPeriod,
      startDate: start,
      endDate: end
    },
    summary: {
      billing: {
        billed: billingTotal,
        totalCollected
      },
      paymentMethods: {
        cash: roundCurrency(paymentsByMethod.CASH || 0),
        card: roundCurrency(paymentsByMethod.CARD || 0),
        other: roundCurrency(paymentsByMethod.BIZUM || 0),
        pendingCurrent: openPendingTotal,
        accountBalance: accountBalanceAmount
      },
      serviceTypes: {
        withDiscounts,
        freeOfChargeCount,
        topUps: topUpsTotal,
        pendingCollections: pendingCollectionsTotal,
        amortizedCount
      },
      cash: {
        openingBalance: activeCashRegister ? Number(activeCashRegister.openingBalance || 0) : 0,
        manualMovements,
        currentCash
      }
    },
    salesAndServices,
    distribution: {
      servicesAmount,
      productsAmount
    },
    professionals
  }
}
