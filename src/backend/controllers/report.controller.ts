import { Request, Response } from 'express'
import { prisma } from '../server'

export const getSalesReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    const where: any = {
      status: 'COMPLETED'
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: true,
        client: true,
        user: {
          select: { name: true }
        }
      }
    })

    // Calcular estadísticas
    const totalSales = sales.length
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0)
    const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0

    // Ventas por método de pago
    const paymentMethods = sales.reduce((acc: any, sale) => {
      acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + Number(sale.total)
      return acc
    }, {})

    // Productos más vendidos
    const productSales: any = {}
    sales.forEach(sale => {
      sale.items.forEach(item => {
        if (item.productId) {
          productSales[item.description] = (productSales[item.description] || 0) + item.quantity
        }
      })
    })

    const topProducts = Object.entries(productSales)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 10)
      .map(([name, quantity]) => ({ name, quantity }))

    res.json({
      totalSales,
      totalRevenue,
      averageTicket,
      paymentMethods,
      topProducts,
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

    // Clientes top por gasto
    const topClients = clients
      .sort((a, b) => Number(b.totalSpent) - Number(a.totalSpent))
      .slice(0, 10)
      .map(client => ({
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
    const totalValue = products.reduce((sum, product) => 
      sum + (Number(product.price) * product.stock), 0
    )

    // Productos con stock bajo
    const lowStockProducts = products
      .filter(p => p.stock <= p.minStock)
      .map(p => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        minStock: p.minStock
      }))

    // Productos más vendidos
    const productSales = products.map(product => {
      const totalSold = product.stockMovements.reduce((sum, movement) => 
        sum + movement.quantity, 0
      )
      return {
        id: product.id,
        name: product.name,
        totalSold,
        revenue: totalSold * Number(product.price)
      }
    }).sort((a, b) => b.totalSold - a.totalSold).slice(0, 10)

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

    const where: any = {}

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      }
    }

    const cashRegisters = await prisma.cashRegister.findMany({
      where,
      include: {
        movements: true
      }
    })

    let totalIncome = 0
    let totalExpenses = 0
    let totalWithdrawals = 0
    let totalDeposits = 0

    cashRegisters.forEach(register => {
      register.movements.forEach(movement => {
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

