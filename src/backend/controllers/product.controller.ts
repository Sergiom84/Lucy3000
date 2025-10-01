import { Request, Response } from 'express'
import { prisma } from '../server'

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, isActive, category } = req.query

    const where: any = {}

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { sku: { contains: search as string, mode: 'insensitive' } },
        { barcode: { contains: search as string, mode: 'insensitive' } }
      ]
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true'
    }

    if (category) {
      where.category = category
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: 'asc' }
    })

    res.json(products)
  } catch (error) {
    console.error('Get products error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        stockMovements: {
          orderBy: { date: 'desc' },
          take: 20
        }
      }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.json(product)
  } catch (error) {
    console.error('Get product error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createProduct = async (req: Request, res: Response) => {
  try {
    const data = req.body

    const product = await prisma.product.create({
      data
    })

    res.status(201).json(product)
  } catch (error) {
    console.error('Create product error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = req.body

    const product = await prisma.product.update({
      where: { id },
      data
    })

    res.json(product)
  } catch (error) {
    console.error('Update product error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.product.delete({
      where: { id }
    })

    res.json({ message: 'Product deleted successfully' })
  } catch (error) {
    console.error('Delete product error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getLowStockProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        stock: {
          lte: prisma.product.fields.minStock
        }
      },
      orderBy: { stock: 'asc' }
    })

    // Crear notificaciones para productos con stock bajo
    for (const product of products) {
      if (product.stock <= product.minStock) {
        await prisma.notification.create({
          data: {
            type: 'LOW_STOCK',
            title: 'Stock bajo',
            message: `El producto "${product.name}" tiene stock bajo (${product.stock} ${product.unit})`,
            priority: 'HIGH'
          }
        })
      }
    }

    res.json(products)
  } catch (error) {
    console.error('Get low stock products error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const addStockMovement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { type, quantity, reason, reference } = req.body

    // Crear movimiento de stock
    const movement = await prisma.stockMovement.create({
      data: {
        productId: id,
        type,
        quantity,
        reason,
        reference
      }
    })

    // Actualizar stock del producto
    const product = await prisma.product.findUnique({
      where: { id }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    let newStock = product.stock

    if (type === 'PURCHASE' || type === 'RETURN' || type === 'ADJUSTMENT') {
      newStock += quantity
    } else if (type === 'SALE' || type === 'DAMAGED') {
      newStock -= quantity
    }

    await prisma.product.update({
      where: { id },
      data: { stock: newStock }
    })

    res.status(201).json(movement)
  } catch (error) {
    console.error('Add stock movement error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

