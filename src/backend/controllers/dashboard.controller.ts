import { Request, Response } from 'express'
import { prisma } from '../server'

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

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
          lte: endOfMonth
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
    const lowStockProducts = await prisma.product.count({
      where: {
        isActive: true,
        stock: {
          lte: prisma.product.fields.minStock
        }
      }
    })

    // Notificaciones no leídas
    const unreadNotifications = await prisma.notification.count({
      where: { isRead: false }
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
        items: true
      },
      orderBy: { date: 'desc' },
      take: 5
    })

    // Gráfico de ventas de los últimos 7 días
    const last7Days = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const nextDay = new Date(date)
      nextDay.setDate(nextDay.getDate() + 1)

      const daySales = await prisma.sale.findMany({
        where: {
          date: {
            gte: date,
            lt: nextDay
          },
          status: 'COMPLETED'
        }
      })

      const dayRevenue = daySales.reduce((sum, sale) => sum + Number(sale.total), 0)

      last7Days.push({
        date: date.toISOString().split('T')[0],
        revenue: dayRevenue,
        count: daySales.length
      })
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
        unreadNotifications
      },
      openCashRegister,
      upcomingAppointments,
      recentSales,
      salesChart: last7Days
    })
  } catch (error) {
    console.error('Get dashboard stats error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

