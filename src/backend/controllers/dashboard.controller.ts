import { Response } from 'express'
import { prisma } from '../db'
import { getAppointmentDisplayName, getSaleDisplayName } from '../utils/customer-display'
import type { AuthRequest } from '../middleware/auth.middleware'
import { getNotificationVisibilityWhere } from '../utils/notifications'

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)

    // Citas de hoy
    const todayAppointments = await prisma.appointment.count({
      where: {
        date: {
          gte: today,
          lt: tomorrow
        }
      }
    })

    // Ventas de hoy
    const todaySales = await prisma.sale.findMany({
      where: {
        date: {
          gte: today,
          lt: tomorrow
        },
        status: 'COMPLETED'
      }
    })

    const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0)

    // Ventas del mes
    const monthSales = await prisma.sale.findMany({
      where: {
        date: {
          gte: startOfMonth,
          lt: startOfNextMonth
        },
        status: 'COMPLETED'
      }
    })

    const monthRevenue = monthSales.reduce((sum, sale) => sum + Number(sale.total), 0)

    // Total de clientes activos
    const totalClients = await prisma.client.count({
      where: { isActive: true }
    })

    // Productos con stock bajo
    const activeProducts = await prisma.product.findMany({
      where: {
        isActive: true
      },
      select: {
        stock: true,
        minStock: true
      }
    })
    const lowStockProducts = activeProducts.filter((product) => product.stock <= product.minStock).length

    // Notificaciones no leídas
    const unreadNotifications = await prisma.notification.count({
      where: {
        isRead: false,
        ...getNotificationVisibilityWhere(req.user?.role)
      }
    })

    const pendingReminders = await prisma.dashboardReminder.count({
      where: {
        isCompleted: false
      }
    })

    // Caja abierta
    const openCashRegister = await prisma.cashRegister.findFirst({
      where: { status: 'OPEN' },
      include: {
        movements: true
      }
    })

    // Próximas citas (próximos 7 días)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const upcomingAppointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: today,
          lte: nextWeek
        },
        status: {
          in: ['SCHEDULED', 'CONFIRMED']
        }
      },
      include: {
        client: true,
        service: true
      },
      orderBy: { date: 'asc' },
      take: 5
    })

    // Ventas recientes
    const recentSales = await prisma.sale.findMany({
      where: {
        status: 'COMPLETED'
      },
      include: {
        client: true,
        appointment: {
          select: {
            guestName: true
          }
        },
        items: true
      },
      orderBy: { date: 'desc' },
      take: 5
    })

    // Gráfico de ingresos: ventana móvil anclada al último día con ventas.
    // Si no hay ventas recientes, muestra el último periodo que sí tuvo actividad
    // en lugar de una semana vacía.
    const CHART_DAYS = 30
    const dayKey = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

    const latestSale = await prisma.sale.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { date: 'desc' },
      select: { date: true }
    })

    const chartEnd = new Date(today)
    if (latestSale?.date) {
      const latest = new Date(latestSale.date)
      latest.setHours(0, 0, 0, 0)
      if (latest < chartEnd) {
        chartEnd.setTime(latest.getTime())
      }
    }

    const chartStart = new Date(chartEnd)
    chartStart.setDate(chartStart.getDate() - (CHART_DAYS - 1))
    const chartEndExclusive = new Date(chartEnd)
    chartEndExclusive.setDate(chartEndExclusive.getDate() + 1)

    const rangeSales = await prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        date: {
          gte: chartStart,
          lt: chartEndExclusive
        }
      },
      select: { date: true, total: true }
    })

    const salesBuckets = new Map<string, { revenue: number; count: number }>()
    for (const sale of rangeSales) {
      const key = dayKey(new Date(sale.date))
      const bucket = salesBuckets.get(key) ?? { revenue: 0, count: 0 }
      bucket.revenue += Number(sale.total)
      bucket.count += 1
      salesBuckets.set(key, bucket)
    }

    const last7Days = []
    for (let i = 0; i < CHART_DAYS; i++) {
      const date = new Date(chartStart)
      date.setDate(date.getDate() + i)
      const key = dayKey(date)
      const bucket = salesBuckets.get(key)
      last7Days.push({
        date: key,
        revenue: bucket?.revenue ?? 0,
        count: bucket?.count ?? 0
      })
    }

    const salesChartPeriod = {
      start: dayKey(chartStart),
      end: dayKey(chartEnd),
      days: CHART_DAYS,
      // true cuando el periodo termina antes de hoy (anclado a la última venta)
      anchoredToLatest: chartEnd.getTime() < today.getTime()
    }

    res.json({
      today: {
        appointments: todayAppointments,
        revenue: todayRevenue,
        salesCount: todaySales.length
      },
      month: {
        revenue: monthRevenue,
        salesCount: monthSales.length
      },
      totals: {
        clients: totalClients,
        lowStockProducts,
        pendingReminders,
        unreadNotifications
      },
      openCashRegister,
      upcomingAppointments: upcomingAppointments.map((appointment) => ({
        ...appointment,
        displayName: getAppointmentDisplayName(appointment)
      })),
      recentSales: recentSales.map((sale) => ({
        ...sale,
        displayName: getSaleDisplayName(sale)
      })),
      salesChart: last7Days,
      salesChartPeriod
    })
  } catch (error) {
    console.error('Get dashboard stats error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

