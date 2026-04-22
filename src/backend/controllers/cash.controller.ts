import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { buildInclusiveDateRange } from '../utils/date-range'
import { getSaleDisplayName } from '../utils/customer-display'
import {
  COMMERCIAL_PAYMENT_METHODS,
  addBreakdownEntriesToBuckets,
  createCommercialPaymentBuckets,
  getPendingCollectionCollectedAmount,
  getPendingCollectionEntry,
  getSalePaymentBreakdown,
  getSalePrivateCashAmount,
  getTopUpCollectedEntry
} from '../utils/payment-breakdown'
import {
  accountBalanceTopUpSummarySelect,
  buildPendingCollectionAnalyticsRows,
  buildSaleAnalyticsRows,
  formatProfessionalName,
  getCollectedRevenue,
  getWorkPerformedRevenue,
  pendingCollectionAnalyticsInclude,
  pendingCollectionSummarySelect,
  saleAnalyticsInclude,
  saleSummarySelect
} from '../utils/sales-reporting'
import { computeCashCountTotals } from '../utils/cashCount'

const PRIVATE_NO_TICKET_CASH_PIN = '0852'

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount)
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const getDayRange = (referenceDate: Date) => {
  const start = new Date(referenceDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(referenceDate)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

const getPeriodRange = (period: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR', referenceDate: Date) => {
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

const commercialSaleRangeWhere = (start: Date, end: Date): Prisma.SaleWhereInput => ({
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

const regularCommercialSaleRangeWhere = (start: Date, end: Date): Prisma.SaleWhereInput => ({
  ...commercialSaleRangeWhere(start, end),
  pendingPayment: null
})

const topUpRangeWhere = (start: Date, end: Date): Prisma.AccountBalanceMovementWhereInput => ({
  type: 'TOP_UP',
  operationDate: {
    gte: start,
    lte: end
  }
})

const pendingCollectionRangeWhere = (
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

const privateCashSaleRangeWhere = (start: Date, end: Date): Prisma.SaleWhereInput => ({
  status: 'COMPLETED',
  pendingPayment: null,
  paymentMethod: 'CASH',
  showInOfficialCash: false,
  date: {
    gte: start,
    lte: end
  }
})

const privateCashCollectionRangeWhere = (
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

const computeExpectedBalance = (cashRegister: {
  openingBalance: Prisma.Decimal
  movements: {
    type: string
    amount: Prisma.Decimal
    paymentMethod: string | null
  }[]
}) => {
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

const getPrivateCashCollectedAmount = (
  performedSales: Array<{
    paymentMethod?: string | null
    paymentBreakdown?: string | null
    showInOfficialCash?: boolean | null
    total: number | string | Prisma.Decimal
    accountBalanceMovements?: Array<{
      type?: string | null
      amount?: number | string | Prisma.Decimal | null
    }>
    pendingPayment?: {
      collections?: Array<{
        paymentMethod?: string | null
        amount: number | string | Prisma.Decimal
        showInOfficialCash?: boolean | null
      }>
    } | null
  }>,
  privateCashSales: Array<{
    paymentMethod?: string | null
    paymentBreakdown?: string | null
    showInOfficialCash?: boolean | null
    total: number | string | Prisma.Decimal
  }>,
  privateCashCollections: Array<{
    paymentMethod?: string | null
    amount: number | string | Prisma.Decimal
    showInOfficialCash?: boolean | null
  }>
) =>
  roundCurrency(
    performedSales.reduce((sum, sale) => sum + getSalePrivateCashAmount(sale), 0) +
      privateCashSales.reduce((sum, sale) => sum + getSalePrivateCashAmount(sale), 0) +
      privateCashCollections.reduce((sum, collection) => sum + Number(collection.amount || 0), 0)
  )

const buildPrivateCashConcept = (items: Array<{ description?: string | null }>) => {
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

const buildPrivateCashPaymentDetail = (payload: {
  type: 'SALE' | 'COLLECTION'
  total?: number | string | Prisma.Decimal
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

const buildCashSummary = async (referenceDate: Date) => {
  const { start: dayStart, end: dayEnd } = getDayRange(referenceDate)
  const { start: monthStart, end: monthEnd } = getPeriodRange('MONTH', referenceDate)
  const { start: yearStart, end: yearEnd } = getPeriodRange('YEAR', referenceDate)

  const [
    activeCashRegister,
    daySales,
    monthSales,
    yearSales,
    dayPerformedSales,
    monthPerformedSales,
    yearPerformedSales,
    dayPrivateCashSales,
    dayCollections,
    monthCollections,
    yearCollections,
    dayPrivateCashCollections,
    dayTopUps,
    monthTopUps,
    yearTopUps
  ] =
    await prisma.$transaction([
    prisma.cashRegister.findFirst({
      where: { status: 'OPEN' },
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
      orderBy: { openedAt: 'desc' }
    }),
    prisma.sale.findMany({
      where: regularCommercialSaleRangeWhere(dayStart, dayEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: regularCommercialSaleRangeWhere(monthStart, monthEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: regularCommercialSaleRangeWhere(yearStart, yearEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: commercialSaleRangeWhere(dayStart, dayEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: commercialSaleRangeWhere(monthStart, monthEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: commercialSaleRangeWhere(yearStart, yearEnd),
      select: saleSummarySelect
    }),
    prisma.sale.findMany({
      where: privateCashSaleRangeWhere(dayStart, dayEnd),
      select: saleSummarySelect
    }),
    prisma.pendingPaymentCollection.findMany({
      where: pendingCollectionRangeWhere(dayStart, dayEnd),
      select: pendingCollectionSummarySelect
    }),
    prisma.pendingPaymentCollection.findMany({
      where: pendingCollectionRangeWhere(monthStart, monthEnd),
      select: pendingCollectionSummarySelect
    }),
    prisma.pendingPaymentCollection.findMany({
      where: pendingCollectionRangeWhere(yearStart, yearEnd),
      select: pendingCollectionSummarySelect
    }),
    prisma.pendingPaymentCollection.findMany({
      where: privateCashCollectionRangeWhere(dayStart, dayEnd),
      select: pendingCollectionSummarySelect
    }),
    prisma.accountBalanceMovement.findMany({
      where: topUpRangeWhere(dayStart, dayEnd),
      select: accountBalanceTopUpSummarySelect
    }),
    prisma.accountBalanceMovement.findMany({
      where: topUpRangeWhere(monthStart, monthEnd),
      select: accountBalanceTopUpSummarySelect
    }),
    prisma.accountBalanceMovement.findMany({
      where: topUpRangeWhere(yearStart, yearEnd),
      select: accountBalanceTopUpSummarySelect
    })
  ])

  const paymentsByMethod = createCommercialPaymentBuckets()

  for (const sale of daySales) {
    addBreakdownEntriesToBuckets(paymentsByMethod, getSalePaymentBreakdown(sale))
  }

  for (const collection of dayCollections) {
    const collectionEntry = getPendingCollectionEntry(collection)
    if (collectionEntry) {
      addBreakdownEntriesToBuckets(paymentsByMethod, [collectionEntry])
    }
  }

  for (const topUp of dayTopUps) {
    const topUpEntry = getTopUpCollectedEntry(topUp)
    if (topUpEntry) {
      addBreakdownEntriesToBuckets(paymentsByMethod, [topUpEntry])
    }
  }

  let deposits = 0
  let expenses = 0
  let withdrawals = 0

  if (activeCashRegister) {
    for (const movement of activeCashRegister.movements) {
      const amount = Number(movement.amount)
      if (movement.type === 'DEPOSIT') deposits += amount
      if (movement.type === 'EXPENSE') expenses += amount
      if (movement.type === 'WITHDRAWAL') withdrawals += amount
    }
  }

  const openingBalance = activeCashRegister ? Number(activeCashRegister.openingBalance) : 0
  const currentBalance = activeCashRegister ? computeExpectedBalance(activeCashRegister) : 0
  const privateCashCollected = getPrivateCashCollectedAmount(
    dayPerformedSales,
    dayPrivateCashSales,
    dayPrivateCashCollections
  )
  const officialCashCollected = roundCurrency(paymentsByMethod.CASH || 0)
  const cardCollected = roundCurrency(paymentsByMethod.CARD || 0)
  const bizumCollected = roundCurrency(paymentsByMethod.BIZUM || 0)

  return {
    activeCashRegister,
    cards: {
      openingBalance,
      paymentsByMethod,
      income: {
        day:
          getCollectedRevenue(daySales) +
          dayCollections.reduce((sum, collection) => sum + getPendingCollectionCollectedAmount(collection), 0) +
          dayTopUps.reduce((sum, topUp) => sum + (getTopUpCollectedEntry(topUp)?.amount || 0), 0),
        month:
          getCollectedRevenue(monthSales) +
          monthCollections.reduce((sum, collection) => sum + getPendingCollectionCollectedAmount(collection), 0) +
          monthTopUps.reduce((sum, topUp) => sum + (getTopUpCollectedEntry(topUp)?.amount || 0), 0),
        year:
          getCollectedRevenue(yearSales) +
          yearCollections.reduce((sum, collection) => sum + getPendingCollectionCollectedAmount(collection), 0) +
          yearTopUps.reduce((sum, topUp) => sum + (getTopUpCollectedEntry(topUp)?.amount || 0), 0)
      },
      workPerformed: {
        day: getWorkPerformedRevenue(dayPerformedSales),
        month: getWorkPerformedRevenue(monthPerformedSales),
        year: getWorkPerformedRevenue(yearPerformedSales)
      },
      closingSummary: {
        expectedOfficialCash: currentBalance,
        officialCashCollected,
        cardCollected,
        bizumCollected,
        privateCashCollected,
        totalCollectedExcludingAbono: roundCurrency(
          officialCashCollected + cardCollected + bizumCollected + privateCashCollected
        )
      },
      currentBalance,
      manualAdjustments: {
        deposits,
        expenses,
        withdrawals
      }
    }
  }
}

const resolveAnalyticsRange = (query: Request['query'] | undefined) => {
  const safeQuery = query || {}
  if (safeQuery.startDate && safeQuery.endDate) {
    const range = buildInclusiveDateRange(safeQuery.startDate as string, safeQuery.endDate as string)
    return {
      start: range.gte as Date,
      end: range.lte as Date
    }
  }

  const period = (safeQuery.period as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR') || 'DAY'
  return getPeriodRange(period, new Date())
}

const getAnalyticsRows = async (query: Request['query'] | undefined) => {
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

export const getPrivateNoTicketCashSales = async (req: Request, res: Response) => {
  try {
    const pin = String(req.query.pin || '').trim()
    if (pin !== PRIVATE_NO_TICKET_CASH_PIN) {
      return res.status(403).json({ error: 'PIN incorrecto' })
    }

    const dateRange =
      req.query.startDate && req.query.endDate
        ? buildInclusiveDateRange(req.query.startDate as string, req.query.endDate as string)
        : null

    const [sales, collections] = await prisma.$transaction([
      prisma.sale.findMany({
        where: {
          status: 'COMPLETED',
          pendingPayment: null,
          ...(dateRange ? { date: dateRange } : {}),
          OR: [
            {
              paymentMethod: 'CASH',
              showInOfficialCash: false
            },
            {
              paymentBreakdown: {
                not: null
              }
            }
          ]
        },
        include: {
          client: {
            select: {
              firstName: true,
              lastName: true
            }
          },
          appointment: {
            select: {
              guestName: true
            }
          },
          user: {
            select: {
              name: true
            }
          },
          items: {
            select: {
              description: true
            }
          }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.pendingPaymentCollection.findMany({
        where: {
          paymentMethod: 'CASH',
          showInOfficialCash: false,
          ...(dateRange ? { operationDate: dateRange } : {})
        },
        include: {
          sale: {
            include: {
              client: {
                select: {
                  firstName: true,
                  lastName: true
                }
              },
              appointment: {
                select: {
                  guestName: true
                }
              },
              user: {
                select: {
                  name: true
                }
              },
              items: {
                select: {
                  description: true
                }
              }
            }
          }
        },
        orderBy: [{ operationDate: 'desc' }, { createdAt: 'desc' }]
      })
    ])

    const saleRows = sales
      .map((sale) => {
        const privateCashAmount = getSalePrivateCashAmount(sale)
        if (privateCashAmount <= 0) {
          return null
        }

        return {
          id: sale.id,
          saleNumber: sale.saleNumber,
          date: sale.date,
          amount: privateCashAmount,
          description: sale.notes || null,
          clientName: getSaleDisplayName(sale),
          professionalName: formatProfessionalName(sale.professional, sale.user?.name),
          paymentDetail: buildPrivateCashPaymentDetail({
            type: 'SALE',
            total: sale.total,
            paymentMethod: sale.paymentMethod,
            paymentBreakdown: sale.paymentBreakdown,
            showInOfficialCash: sale.showInOfficialCash
          }),
          treatmentName: buildPrivateCashConcept(sale.items)
        }
      })
      .filter(
        (
          row
        ): row is {
          id: string
          saleNumber: string
          date: Date
          amount: number
          description: string | null
          clientName: string
          professionalName: string
          paymentDetail: string
          treatmentName: string
        } => Boolean(row)
      )

    const rows = [
      ...saleRows,
      ...collections.map((collection) => ({
        id: collection.id,
        saleNumber: collection.sale.saleNumber,
        date: collection.operationDate,
        amount: Number(collection.amount),
        description: 'Cobro pendiente sin ticket',
        clientName: getSaleDisplayName(collection.sale),
        professionalName: formatProfessionalName(collection.sale.professional, collection.sale.user?.name),
        paymentDetail: buildPrivateCashPaymentDetail({
          type: 'COLLECTION'
        }),
        treatmentName: buildPrivateCashConcept(collection.sale.items)
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    res.json({
      rows,
      totalAmount: rows.reduce((sum, row) => sum + row.amount, 0)
    })
  } catch (error) {
    console.error('Get private no-ticket cash sales error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashRegisters = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, status } = req.query

    const where: Prisma.CashRegisterWhereInput = {}

    if (startDate && endDate) {
      where.date = buildInclusiveDateRange(startDate as string, endDate as string)
    }

    if (status) {
      where.status = status as string
    }

    const cashRegisters = await prisma.cashRegister.findMany({
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

    res.json(cashRegisters)
  } catch (error) {
    console.error('Get cash registers error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashRegisterById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

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
      return res.status(404).json({ error: 'Cash register not found' })
    }

    res.json(cashRegister)
  } catch (error) {
    console.error('Get cash register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashSummary = async (req: Request, res: Response) => {
  try {
    const referenceDate = req.query?.referenceDate ? new Date(req.query.referenceDate as string) : new Date()
    const summary = await buildCashSummary(referenceDate)
    res.json(summary)
  } catch (error) {
    console.error('Get cash summary error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashAnalytics = async (req: Request, res: Response) => {
  try {
    const rows = await getAnalyticsRows(req.query)
    res.json({ rows })
  } catch (error) {
    console.error('Get cash analytics error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashRanking = async (req: Request, res: Response) => {
  try {
    const rows = await getAnalyticsRows(req.query)

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

    res.json({
      services: aggregate('SERVICE'),
      products: aggregate('PRODUCT')
    })
  } catch (error) {
    console.error('Get cash ranking error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const openCashRegister = async (req: Request, res: Response) => {
  try {
    const { openingBalance, notes } = req.body

    const openCashRegister = await prisma.cashRegister.findFirst({
      where: { status: 'OPEN' }
    })

    if (openCashRegister) {
      return res.status(400).json({ error: 'There is already an open cash register' })
    }

    const cashRegister = await prisma.cashRegister.create({
      data: {
        openingBalance,
        notes
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

    res.status(201).json(cashRegister)
  } catch (error) {
    console.error('Open cash register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const closeCashRegister = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { closingBalance, notes } = req.body

    const cashRegister = await prisma.cashRegister.findUnique({
      where: { id },
      include: {
        movements: true
      }
    })

    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' })
    }

    if (cashRegister.status === 'CLOSED') {
      return res.status(400).json({ error: 'Cash register is already closed' })
    }

    const expectedBalance = computeExpectedBalance(cashRegister)
    const difference = Number(closingBalance) - expectedBalance

    const updatedCashRegister = await prisma.cashRegister.update({
      where: { id },
      data: {
        closingBalance,
        expectedBalance,
        difference,
        status: 'CLOSED',
        closedAt: new Date(),
        notes
      }
    })

    res.json(updatedCashRegister)
  } catch (error) {
    console.error('Close cash register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const addCashMovement = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { type, paymentMethod, amount, category, description, reference } = req.body

    const cashRegister = await prisma.cashRegister.findUnique({
      where: { id }
    })

    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' })
    }

    if (cashRegister.status === 'CLOSED') {
      return res.status(400).json({ error: 'Cannot add movements to a closed cash register' })
    }

    const movement = await prisma.cashMovement.create({
      data: {
        cashRegisterId: id,
        userId: req.user!.id,
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

    res.status(201).json(movement)
  } catch (error) {
    console.error('Add cash movement error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashMovements = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const movements = await prisma.cashMovement.findMany({
      where: { cashRegisterId: id },
      include: {
        user: {
          select: { name: true }
        }
      },
      orderBy: { date: 'desc' }
    })

    res.json(movements)
  } catch (error) {
    console.error('Get cash movements error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateOpeningBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { openingBalance, notes } = req.body

    const cashRegister = await prisma.cashRegister.findUnique({
      where: { id },
      include: {
        movements: true
      }
    })

    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' })
    }

    if (cashRegister.status === 'CLOSED') {
      return res.status(400).json({ error: 'Cannot modify opening balance of a closed cash register' })
    }

    const oldOpeningBalance = Number(cashRegister.openingBalance)
    const newOpeningBalance = Number(openingBalance)
    const difference = newOpeningBalance - oldOpeningBalance

    // Update the opening balance
    const updatedCashRegister = await prisma.cashRegister.update({
      where: { id },
      data: {
        openingBalance: newOpeningBalance
      }
    })

    // Create an adjustment movement if there's a difference
    if (difference !== 0) {
      await prisma.cashMovement.create({
        data: {
          cashRegisterId: id,
          userId: req.user!.id,
          type: difference > 0 ? 'INCOME' : 'EXPENSE',
          paymentMethod: null,
          amount: Math.abs(difference),
          category: 'Ajuste de saldo inicial',
          description: `Ajuste de saldo inicial: ${formatCurrency(oldOpeningBalance)} → ${formatCurrency(newOpeningBalance)}`,
          reference: `Diferencia: ${difference > 0 ? '+' : ''}${formatCurrency(difference)}`
        }
      })
    }

    res.json(updatedCashRegister)
  } catch (error) {
    console.error('Update opening balance error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createCashCount = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { denominations, isBlind, appliedAsClose, notes } = req.body as {
      denominations: Record<string, number>
      isBlind?: boolean
      appliedAsClose?: boolean
      notes?: string | null
    }

    const cashRegister = await prisma.cashRegister.findUnique({
      where: { id },
      include: { movements: true }
    })

    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' })
    }

    if (cashRegister.status === 'CLOSED' && !appliedAsClose) {
      return res.status(400).json({ error: 'Cannot create cash count for a closed register' })
    }

    const expectedTotal = computeExpectedBalance(cashRegister)
    const { countedTotal, difference, normalizedDenominations } = computeCashCountTotals(
      denominations || {},
      expectedTotal
    )

    const created = await prisma.cashCount.create({
      data: {
        cashRegisterId: id,
        userId: req.user!.id,
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

    res.status(201).json({
      ...created,
      denominations: normalizedDenominations
    })
  } catch (error) {
    console.error('Create cash count error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const listCashCounts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const limit = Number(req.query.limit) || 20

    const counts = await prisma.cashCount.findMany({
      where: { cashRegisterId: id },
      include: {
        user: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    const parsed = counts.map((count) => {
      let denominations: Record<string, number> = {}
      try {
        denominations = JSON.parse(count.denominations)
      } catch {
        denominations = {}
      }
      return { ...count, denominations }
    })

    res.json(parsed)
  } catch (error) {
    console.error('List cash counts error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
