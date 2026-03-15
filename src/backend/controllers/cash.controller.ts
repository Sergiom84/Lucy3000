import { PaymentMethod, Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { buildInclusiveDateRange } from '../utils/date-range'

const paymentMethods: PaymentMethod[] = ['CASH', 'CARD', 'BIZUM', 'OTHER']
const PRIVATE_NO_TICKET_CASH_PIN = '0852'

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount)
}

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

const saleRangeWhere = (start: Date, end: Date): Prisma.SaleWhereInput => ({
  status: 'COMPLETED',
  NOT: {
    paymentMethod: 'CASH',
    showInOfficialCash: false
  },
  date: {
    gte: start,
    lte: end
  }
})

const computeExpectedBalance = (cashRegister: {
  openingBalance: Prisma.Decimal
  movements: {
    type: 'INCOME' | 'EXPENSE' | 'WITHDRAWAL' | 'DEPOSIT'
    amount: Prisma.Decimal
    paymentMethod: PaymentMethod | null
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

const buildCashSummary = async (referenceDate: Date) => {
  const { start: dayStart, end: dayEnd } = getDayRange(referenceDate)
  const { start: monthStart, end: monthEnd } = getPeriodRange('MONTH', referenceDate)
  const { start: yearStart, end: yearEnd } = getPeriodRange('YEAR', referenceDate)

  const [activeCashRegister, daySales, monthSales, yearSales] = await Promise.all([
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
      where: saleRangeWhere(dayStart, dayEnd),
      select: { total: true, paymentMethod: true }
    }),
    prisma.sale.findMany({
      where: saleRangeWhere(monthStart, monthEnd),
      select: { total: true }
    }),
    prisma.sale.findMany({
      where: saleRangeWhere(yearStart, yearEnd),
      select: { total: true }
    })
  ])

  const paymentsByMethod = paymentMethods.reduce<Record<PaymentMethod, number>>((acc, method) => {
    acc[method] = 0
    return acc
  }, {} as Record<PaymentMethod, number>)

  for (const sale of daySales) {
    paymentsByMethod[sale.paymentMethod] += Number(sale.total)
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
  const cashIncomeToday = paymentsByMethod.CASH
  const currentBalance = openingBalance + cashIncomeToday + deposits - expenses - withdrawals

  return {
    activeCashRegister,
    cards: {
      openingBalance,
      paymentsByMethod,
      income: {
        day: daySales.reduce((sum, sale) => sum + Number(sale.total), 0),
        month: monthSales.reduce((sum, sale) => sum + Number(sale.total), 0),
        year: yearSales.reduce((sum, sale) => sum + Number(sale.total), 0)
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
  const paymentMethod = safeQuery.paymentMethod as PaymentMethod | undefined
  const clientId = safeQuery.clientId as string | undefined
  const serviceId = safeQuery.serviceId as string | undefined
  const productId = safeQuery.productId as string | undefined
  const type = (safeQuery.type as 'ALL' | 'SERVICE' | 'PRODUCT' | undefined) || 'ALL'

  const itemFilter: Prisma.SaleItemWhereInput = {}
  if (serviceId) itemFilter.serviceId = serviceId
  if (productId) itemFilter.productId = productId
  if (type === 'SERVICE') itemFilter.serviceId = { not: null }
  if (type === 'PRODUCT') itemFilter.productId = { not: null }

  const sales = await prisma.sale.findMany({
    where: {
      status: 'COMPLETED',
      NOT: {
        paymentMethod: 'CASH',
        showInOfficialCash: false
      },
      date: {
        gte: start,
        lte: end
      },
      ...(clientId ? { clientId } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(serviceId || productId || type !== 'ALL' ? { items: { some: itemFilter } } : {})
    },
    include: {
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
      items: {
        where: serviceId || productId || type !== 'ALL' ? itemFilter : undefined,
        include: {
          service: {
            select: { id: true, name: true }
          },
          product: {
            select: { id: true, name: true }
          }
        }
      }
    },
    orderBy: { date: 'desc' }
  })

  return sales.flatMap((sale) =>
    sale.items.map((item) => ({
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      date: sale.date,
      clientId: sale.clientId,
      clientName: sale.client ? `${sale.client.firstName} ${sale.client.lastName}`.trim() : 'Cliente general',
      paymentMethod: sale.paymentMethod,
      professionalName: sale.user?.name || 'Sin usuario',
      itemType: item.serviceId ? 'SERVICE' : 'PRODUCT',
      serviceId: item.serviceId,
      productId: item.productId,
      concept: item.service?.name || item.product?.name || item.description,
      quantity: item.quantity,
      amount: Number(item.subtotal)
    }))
  )
}

export const getPrivateNoTicketCashSales = async (req: Request, res: Response) => {
  try {
    const pin = String(req.query.pin || '').trim()
    if (pin !== PRIVATE_NO_TICKET_CASH_PIN) {
      return res.status(403).json({ error: 'PIN incorrecto' })
    }

    const sales = await prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        paymentMethod: 'CASH',
        showInOfficialCash: false
      },
      include: {
        client: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        user: {
          select: {
            name: true
          }
        }
      },
      orderBy: { date: 'desc' }
    })

    const rows = sales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      date: sale.date,
      amount: Number(sale.total),
      description: sale.notes || null,
      clientName: sale.client ? `${sale.client.firstName} ${sale.client.lastName}`.trim() : 'Cliente general',
      userName: sale.user?.name || 'Sin usuario'
    }))

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
