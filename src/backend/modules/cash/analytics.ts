import { Prisma } from '@prisma/client'
import { Request } from 'express'
import { prisma } from '../../db'
import { buildInclusiveDateRange } from '../../utils/date-range'
import {
  buildPendingCollectionAnalyticsRows,
  buildSaleAnalyticsRows,
  pendingCollectionAnalyticsInclude,
  saleAnalyticsInclude
} from '../../utils/sales-reporting'
import { CashPeriod, getPeriodRange, pendingCollectionRangeWhere, regularCommercialSaleRangeWhere } from './shared'

const resolveAnalyticsRange = (query: Request['query'] | undefined) => {
  const safeQuery = query || {}
  if (safeQuery.startDate && safeQuery.endDate) {
    const range = buildInclusiveDateRange(safeQuery.startDate as string, safeQuery.endDate as string)
    return {
      start: range.gte as Date,
      end: range.lte as Date
    }
  }

  const period = (safeQuery.period as CashPeriod) || 'DAY'
  return getPeriodRange(period, new Date())
}

export const getAnalyticsRows = async (query: Request['query'] | undefined) => {
  const safeQuery = query || {}
  const { start, end } = resolveAnalyticsRange(safeQuery)
  const paymentMethod = safeQuery.paymentMethod as string | undefined
  const clientId = safeQuery.clientId as string | undefined
  const serviceId = safeQuery.serviceId as string | undefined
  const productId = safeQuery.productId as string | undefined
  const type = (safeQuery.type as 'ALL' | 'SERVICE' | 'PRODUCT' | undefined) || 'ALL'

  const itemFilter: Prisma.SaleItemWhereInput = {}
  if (serviceId) itemFilter.serviceId = serviceId
  if (productId) itemFilter.productId = productId
  if (type === 'SERVICE') itemFilter.serviceId = { not: null }
  if (type === 'PRODUCT') itemFilter.productId = { not: null }

  const [sales, pendingCollections] = await prisma.$transaction([
    prisma.sale.findMany({
      where: {
        ...regularCommercialSaleRangeWhere(start, end),
        ...(clientId ? { clientId } : {}),
        ...(serviceId || productId || type !== 'ALL' ? { items: { some: itemFilter } } : {})
      },
      include: saleAnalyticsInclude,
      orderBy: { date: 'desc' }
    }),
    prisma.pendingPaymentCollection.findMany({
      where: {
        ...pendingCollectionRangeWhere(start, end),
        ...(clientId ? { clientId } : {}),
        ...(serviceId || productId || type !== 'ALL'
          ? {
              sale: {
                items: {
                  some: itemFilter
                }
              }
            }
          : {})
      },
      include: pendingCollectionAnalyticsInclude,
      orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }]
    })
  ])

  const saleRows = buildSaleAnalyticsRows(sales, {
    paymentMethod,
    serviceId,
    productId,
    type
  })
  const collectionRows = buildPendingCollectionAnalyticsRows(pendingCollections, {
    paymentMethod,
    serviceId,
    productId,
    type
  })

  return [...saleRows, ...collectionRows].sort((a, b) => b.date.getTime() - a.date.getTime())
}

export const getCashRankingData = async (query: Request['query'] | undefined) => {
  const rows = await getAnalyticsRows(query)

  const aggregate = (itemType: 'SERVICE' | 'PRODUCT') => {
    const map = new Map<string, { id: string; name: string; quantity: number; revenue: number }>()

    for (const row of rows) {
      if (row.itemType !== itemType) continue

      const key = row.serviceId || row.productId || row.concept
      const entry = map.get(key) || {
        id: key,
        name: row.concept,
        quantity: 0,
        revenue: 0
      }

      entry.quantity += row.quantity
      entry.revenue += row.amount
      map.set(key, entry)
    }

    const values = Array.from(map.values())
    return {
      top: [...values].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10),
      bottom: [...values].sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue).slice(0, 10)
    }
  }

  return {
    services: aggregate('SERVICE'),
    products: aggregate('PRODUCT')
  }
}
