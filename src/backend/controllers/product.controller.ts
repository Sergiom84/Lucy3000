import { Request, Response } from 'express'
import { prisma } from '../db'
import * as XLSX from 'xlsx'

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
      where.isActive = typeof isActive === 'boolean' ? isActive : isActive === 'true'
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
        isActive: true
      },
      select: {
        id: true,
        name: true,
        description: true,
        sku: true,
        barcode: true,
        category: true,
        brand: true,
        price: true,
        cost: true,
        stock: true,
        minStock: true,
        maxStock: true,
        unit: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { stock: 'asc' }
    })
    const lowStockProducts = products.filter((product) => product.stock <= product.minStock)

    // Crear notificaciones para productos con stock bajo
    for (const product of lowStockProducts) {
      const notificationTitle = `Stock bajo: ${product.name}`
      const existingNotification = await prisma.notification.findFirst({
        where: {
          type: 'LOW_STOCK',
          isRead: false,
          title: notificationTitle
        }
      })

      if (!existingNotification) {
        await prisma.notification.create({
          data: {
            type: 'LOW_STOCK',
            title: notificationTitle,
            message: `Stock actual: ${product.stock} ${product.unit}. Stock mínimo: ${product.minStock}.`,
            priority: 'HIGH'
          }
        })
      }
    }

    res.json(lowStockProducts)
  } catch (error) {
    console.error('Get low stock products error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const addStockMovement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { type, quantity, reason, reference } = req.body
    const parsedQuantity = Number(quantity)
    const allowedTypes = ['PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN', 'DAMAGED']

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid stock movement type' })
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity === 0) {
      return res.status(400).json({ error: 'Quantity must be a non-zero integer' })
    }

    if (type !== 'ADJUSTMENT' && parsedQuantity < 0) {
      return res.status(400).json({ error: 'Quantity must be positive for this movement type' })
    }

    // Actualizar stock del producto
    const product = await prisma.product.findUnique({
      where: { id }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    let newStock = product.stock

    if (type === 'ADJUSTMENT') {
      newStock += parsedQuantity
    } else if (type === 'PURCHASE' || type === 'RETURN') {
      newStock += parsedQuantity
    } else if (type === 'SALE' || type === 'DAMAGED') {
      newStock -= parsedQuantity
    }

    if (newStock < 0) {
      return res.status(400).json({ error: 'Stock cannot be negative after this movement' })
    }

    const movement = await prisma.$transaction(async (tx) => {
      const createdMovement = await tx.stockMovement.create({
        data: {
          productId: id,
          type,
          quantity: parsedQuantity,
          reason,
          reference
        }
      })

      await tx.product.update({
        where: { id },
        data: { stock: newStock }
      })

      return createdMovement
    })

    res.status(201).json(movement)
  } catch (error) {
    console.error('Add stock movement error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const importProductsFromExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // Leer el archivo Excel
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet)

    const results = {
      success: 0,
      errors: [] as any[],
      skipped: 0
    }

    // Procesar cada fila
    for (let i = 0; i < data.length; i++) {
      const row: any = data[i]

      try {
        // Validar campos requeridos
        if (!row.nombre || !row.sku || !row.precio || !row.costo) {
          results.errors.push({
            row: i + 2, // +2 porque Excel empieza en 1 y tiene header
            error: 'Faltan campos requeridos (nombre, sku, precio, costo)'
          })
          results.skipped++
          continue
        }

        // Verificar si el SKU ya existe
        const existingProduct = await prisma.product.findFirst({
          where: { sku: String(row.sku).trim() }
        })

        if (existingProduct) {
          results.errors.push({
            row: i + 2,
            error: `SKU ${row.sku} ya existe`
          })
          results.skipped++
          continue
        }

        // Crear producto
        await prisma.product.create({
          data: {
            name: String(row.nombre).trim(),
            description: row.descripcion ? String(row.descripcion).trim() : null,
            sku: String(row.sku).trim(),
            barcode: row.codigoBarras ? String(row.codigoBarras).trim() : null,
            category: row.categoria ? String(row.categoria).trim() : 'Otros',
            brand: row.marca ? String(row.marca).trim() : null,
            price: parseFloat(row.precio),
            cost: parseFloat(row.costo),
            stock: row.stock ? parseInt(row.stock) : 0,
            minStock: row.stockMinimo ? parseInt(row.stockMinimo) : 5,
            maxStock: row.stockMaximo ? parseInt(row.stockMaximo) : null,
            unit: row.unidad ? String(row.unidad).trim() : 'unidad',
            isActive: row.activo === undefined ? true : Boolean(row.activo)
          }
        })

        results.success++
      } catch (error: any) {
        results.errors.push({
          row: i + 2,
          error: error.message
        })
        results.skipped++
      }
    }

    res.json({
      message: 'Import completed',
      results
    })
  } catch (error) {
    console.error('Import products error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

