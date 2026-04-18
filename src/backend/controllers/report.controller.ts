import { Request, Response } from 'express'
import { prisma } from '../db'
import { buildInclusiveDateRange } from '../utils/date-range'
import {
  buildCommercialPaymentMethodResponse,
  buildTopProducts,
  getCollectedRevenue,
  getWorkPerformedRevenue,
  saleAnalyticsInclude
} from '../utils/sales-reporting'

const BONO_TEMPLATES_SETTING_KEY = 'bono_templates_catalog'

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const normalizeLookupValue = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const buildBonoTemplateKey = (description: unknown, serviceId: unknown, price: unknown) =>
  `${normalizeLookupValue(description)}::${normalizeLookupValue(serviceId)}::${roundCurrency(Number(price) || 0)}`

const readBonoTemplateKeys = async () => {
  const setting = await prisma.setting.findUnique({
    where: { key: BONO_TEMPLATES_SETTING_KEY },
    select: { value: true }
  })

  if (!setting?.value) return new Set<string>()

  try {
    const parsed = JSON.parse(setting.value)
    if (!Array.isArray(parsed)) return new Set<string>()

    const keys = parsed
      .filter((template) => template && template.isActive !== false)
      .map((template) => buildBonoTemplateKey(template.description, template.serviceId, template.price))
      .filter(Boolean)

    return new Set(keys)
  } catch {
    return new Set<string>()
  }
}

const buildTopServices = (
  sales: Array<{
    items: Array<{
      serviceId: string | null
      description: string
      quantity: number
      price: unknown
      subtotal: unknown
      service?: { id: string; name: string } | null
    }>
  }>,
  bonoTemplateKeys: Set<string>
) => {
  const serviceTotals = new Map<string, { id: string; name: string; quantity: number; revenue: number }>()

  for (const sale of sales) {
    for (const item of sale.items) {
      if (!item.serviceId) continue

      const bonoTemplateKey = buildBonoTemplateKey(item.description, item.serviceId, item.price)
      if (bonoTemplateKeys.has(bonoTemplateKey)) continue

      const key = item.serviceId || item.description
      const current = serviceTotals.get(key) || {
        id: key,
        name: item.service?.name || item.description,
        quantity: 0,
        revenue: 0
      }

      current.quantity += Number(item.quantity || 0)
      current.revenue += Number(item.subtotal || 0)
      serviceTotals.set(key, current)
    }
  }

  return Array.from(serviceTotals.values())
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 10)
    .map((entry) => ({
      ...entry,
      revenue: roundCurrency(entry.revenue)
    }))
}

export const getSalesReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    const where: Record<string, unknown> = {
      status: 'COMPLETED'
    }
    const accountBalanceWhere: Record<string, unknown> = {
      type: {
        in: ['TOP_UP', 'CONSUMPTION']
      }
    }
    const soldBonosWhere: Record<string, unknown> = {}
    let dateRange: ReturnType<typeof buildInclusiveDateRange> | undefined

    if (startDate && endDate) {
      dateRange = buildInclusiveDateRange(startDate as string, endDate as string)
      where.date = dateRange
      accountBalanceWhere.operationDate = dateRange
      soldBonosWhere.purchaseDate = dateRange
    }

    const [sales, accountBalanceMovements, soldBonos, consumedBonos, allCompletedSales, bonoTemplateKeys] =
      await Promise.all([
        prisma.sale.findMany({
          where,
          include: saleAnalyticsInclude
        }),
        prisma.accountBalanceMovement.findMany({
          where: accountBalanceWhere,
          select: {
            type: true,
            amount: true
          }
        }),
        prisma.bonoPack.findMany({
          where: soldBonosWhere,
          select: {
            id: true,
            name: true
          }
        }),
        prisma.bonoPack.findMany({
          select: {
            sessions: {
              where: dateRange
                ? {
                    status: 'CONSUMED',
                    consumedAt: dateRange
                  }
                : {
                    status: 'CONSUMED'
                  },
              select: {
                id: true
              }
            }
          }
        }),
        prisma.sale.findMany({
          where: {
            status: 'COMPLETED'
          },
          select: {
            items: {
              include: {
                service: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }),
        readBonoTemplateKeys()
      ])

    const totalSales = sales.length
    const collectedRevenue = getCollectedRevenue(sales)
    const workPerformedRevenue = getWorkPerformedRevenue(sales)
    const averageTicket = totalSales > 0 ? workPerformedRevenue / totalSales : 0
    const paymentMethods = buildCommercialPaymentMethodResponse(sales)
    const topProducts = buildTopProducts(sales)
    const topServices = buildTopServices(allCompletedSales, bonoTemplateKeys)

    const accountBalanceSummary = accountBalanceMovements.reduce(
      (summary, movement) => {
        const amount = Number(movement.amount || 0)

        if (movement.type === 'TOP_UP') {
          summary.topUpCount += 1
          summary.topUpTotal += amount
        }

        if (movement.type === 'CONSUMPTION') {
          summary.consumptionCount += 1
          summary.consumptionTotal += amount
        }

        return summary
      },
      {
        topUpCount: 0,
        topUpTotal: 0,
        consumptionCount: 0,
        consumptionTotal: 0
      }
    )

    const topBonos = Array.from(
      soldBonos.reduce((acc, bono) => {
        const key = String(bono.name || '').trim() || 'Bono sin nombre'
        acc.set(key, (acc.get(key) || 0) + 1)
        return acc
      }, new Map<string, number>())
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }))

    const bonoSummary = {
      soldCount: soldBonos.length,
      consumedSessions: consumedBonos.reduce((sum, bono) => sum + bono.sessions.length, 0),
      topBonos
    }

    res.json({
      totalSales,
      totalRevenue: workPerformedRevenue,
      collectedRevenue,
      workPerformedRevenue,
      averageTicket,
      paymentMethods,
      topProducts,
      topServices,
      accountBalanceSummary: {
        topUpCount: accountBalanceSummary.topUpCount,
        topUpTotal: roundCurrency(accountBalanceSummary.topUpTotal),
        consumptionCount: accountBalanceSummary.consumptionCount,
        consumptionTotal: roundCurrency(accountBalanceSummary.consumptionTotal)
      },
      bonoSummary,
      sales
    })
  } catch (error) {
    console.error('Get sales report error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getClientReport = async (req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            appointments: true,
            sales: true
          }
        }
      }
    })

    const totalClients = clients.length
    const totalSpent = clients.reduce((sum, client) => sum + Number(client.totalSpent), 0)
    const averageSpent = totalClients > 0 ? totalSpent / totalClients : 0

    const topClients = clients
      .sort((a, b) => Number(b.totalSpent) - Number(a.totalSpent))
      .slice(0, 10)
      .map((client) => ({
        id: client.id,
        name: `${client.firstName} ${client.lastName}`,
        totalSpent: client.totalSpent,
        loyaltyPoints: client.loyaltyPoints,
        appointmentCount: client._count.appointments,
        saleCount: client._count.sales
      }))

    res.json({
      totalClients,
      totalSpent,
      averageSpent,
      topClients
    })
  } catch (error) {
    console.error('Get client report error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getProductReport = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        stockMovements: {
          where: {
            type: 'SALE'
          }
        }
      }
    })

    const totalProducts = products.length
    const totalValue = products.reduce((sum, product) => sum + Number(product.price) * product.stock, 0)

    const lowStockProducts = products
      .filter((product) => product.stock <= product.minStock)
      .map((product) => ({
        id: product.id,
        name: product.name,
        stock: product.stock,
        minStock: product.minStock
      }))

    const productSales = products
      .map((product) => {
        const totalSold = product.stockMovements.reduce((sum, movement) => sum + movement.quantity, 0)
        return {
          id: product.id,
          name: product.name,
          totalSold,
          revenue: totalSold * Number(product.price)
        }
      })
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 10)

    res.json({
      totalProducts,
      totalValue,
      lowStockProducts,
      topProducts: productSales
    })
  } catch (error) {
    console.error('Get product report error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCashReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    const registerWhere: Record<string, unknown> = {}
    let movementDateRange: ReturnType<typeof buildInclusiveDateRange> | undefined

    if (startDate && endDate) {
      movementDateRange = buildInclusiveDateRange(startDate as string, endDate as string)
      registerWhere.movements = {
        some: {
          date: movementDateRange
        }
      }
    }

    const cashRegisters = await prisma.cashRegister.findMany({
      where: registerWhere,
      include: {
        movements: movementDateRange
          ? {
              where: {
                date: movementDateRange
              }
            }
          : true
      }
    })

    let totalIncome = 0
    let totalExpenses = 0
    let totalWithdrawals = 0
    let totalDeposits = 0

    cashRegisters.forEach((register) => {
      register.movements.forEach((movement) => {
        const amount = Number(movement.amount)
        switch (movement.type) {
          case 'INCOME':
            totalIncome += amount
            break
          case 'EXPENSE':
            totalExpenses += amount
            break
          case 'WITHDRAWAL':
            totalWithdrawals += amount
            break
          case 'DEPOSIT':
            totalDeposits += amount
            break
        }
      })
    })

    const netCashFlow = totalIncome - totalExpenses + totalDeposits - totalWithdrawals

    res.json({
      totalIncome,
      totalExpenses,
      totalWithdrawals,
      totalDeposits,
      netCashFlow,
      cashRegisters
    })
  } catch (error) {
    console.error('Get cash report error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
