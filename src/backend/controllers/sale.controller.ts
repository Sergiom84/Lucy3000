import { Request, Response } from 'express'
import { prisma } from '../server'
import { AuthRequest } from '../middleware/auth.middleware'

export const getSales = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, clientId, status } = req.query

    const where: any = {}

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      }
    }

    if (clientId) {
      where.clientId = clientId
    }

    if (status) {
      where.status = status
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        client: true,
        user: {
          select: { name: true }
        },
        items: true
      },
      orderBy: { date: 'desc' }
    })

    res.json(sales)
  } catch (error) {
    console.error('Get sales error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getSaleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        client: true,
        user: true,
        items: {
          include: {
            product: true,
            service: true
          }
        }
      }
    })

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' })
    }

    res.json(sale)
  } catch (error) {
    console.error('Get sale error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createSale = async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, items, discount, tax, paymentMethod, notes } = req.body

    // Calcular totales
    let subtotal = 0
    for (const item of items) {
      subtotal += item.quantity * item.price
    }

    const total = subtotal - (discount || 0) + (tax || 0)

    // Generar número de venta
    const lastSale = await prisma.sale.findFirst({
      orderBy: { id: 'desc' }
    })

    const saleNumber = lastSale 
      ? `V-${(parseInt(lastSale.saleNumber.split('-')[1]) + 1).toString().padStart(6, '0')}`
      : 'V-000001'

    // Crear venta
    const sale = await prisma.sale.create({
      data: {
        clientId,
        userId: req.user!.id,
        saleNumber,
        subtotal,
        discount: discount || 0,
        tax: tax || 0,
        total,
        paymentMethod,
        notes,
        items: {
          create: items.map((item: any) => ({
            productId: item.productId,
            serviceId: item.serviceId,
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.quantity * item.price
          }))
        }
      },
      include: {
        items: true,
        client: true
      }
    })

    // Actualizar stock de productos
    for (const item of items) {
      if (item.productId) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity
            }
          }
        })

        // Crear movimiento de stock
        await prisma.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'SALE',
            quantity: item.quantity,
            reference: saleNumber
          }
        })
      }
    }

    // Actualizar puntos de fidelidad del cliente
    if (clientId) {
      const pointsEarned = Math.floor(total / 10) // 1 punto por cada 10 unidades monetarias
      await prisma.client.update({
        where: { id: clientId },
        data: {
          loyaltyPoints: {
            increment: pointsEarned
          },
          totalSpent: {
            increment: total
          }
        }
      })
    }

    res.status(201).json(sale)
  } catch (error) {
    console.error('Create sale error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = req.body

    const sale = await prisma.sale.update({
      where: { id },
      data,
      include: {
        items: true,
        client: true
      }
    })

    res.json(sale)
  } catch (error) {
    console.error('Update sale error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.sale.delete({
      where: { id }
    })

    res.json({ message: 'Sale deleted successfully' })
  } catch (error) {
    console.error('Delete sale error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

