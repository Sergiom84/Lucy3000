import { Request, Response } from 'express'
import { prisma } from '../db'
import * as XLSX from 'xlsx'

const parseSpanishDecimal = (value: unknown): number => {
  if (value === null || value === undefined) return NaN
  const normalized = String(value).trim().replace(/\s*€\s*/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

const parseIntegerValue = (value: unknown): number => {
  if (value === null || value === undefined || String(value).trim() === '') return 0
  const parsed = Number.parseInt(String(value).trim(), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, isActive, category } = req.query

    const where: any = {}

    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { sku: { contains: search as string } },
        { barcode: { contains: search as string } }
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
        const legacyId = row.ID ?? row.id ?? row.sku ?? row.SKU
        const brand = row.Marca ?? row.marca ?? null
        const family = row.Familia ?? row.familia ?? row.categoria
        const productDescription = row['Descripción'] ?? row.descripcion ?? row.nombre
        const quantityRaw = row.Cantidad ?? row.cantidad ?? row.stock
        const pvpRaw = row.PVP ?? row.pvp ?? row.precio

        if (
          legacyId === null || legacyId === undefined || String(legacyId).trim() === '' ||
          productDescription === null || productDescription === undefined || String(productDescription).trim() === '' ||
          family === null || family === undefined || String(family).trim() === '' ||
          pvpRaw === null || pvpRaw === undefined || String(pvpRaw).trim() === ''
        ) {
          results.errors.push({
            row: i + 2, // +2 porque Excel empieza en 1 y tiene header
            error: 'Faltan campos requeridos (ID, Familia, Descripción, PVP)'
          })
          results.skipped++
          continue
        }

        const sku = String(legacyId).trim()
        const price = parseSpanishDecimal(pvpRaw)
        const stock = parseIntegerValue(quantityRaw)

        if (!Number.isFinite(price) || price <= 0) {
          results.errors.push({
            row: i + 2,
            error: `PVP inválido: ${String(pvpRaw)}`
          })
          results.skipped++
          continue
        }

        // Verificar si el SKU ya existe
        const existingProduct = await prisma.product.findFirst({
          where: { sku }
        })

        if (existingProduct) {
          results.errors.push({
            row: i + 2,
            error: `ID ${sku} ya existe`
          })
          results.skipped++
          continue
        }

        // Crear producto
        await prisma.product.create({
          data: {
            name: String(productDescription).trim(),
            description: null,
            sku,
            barcode: null,
            category: String(family).trim(),
            brand: brand === null || brand === undefined || String(brand).trim() === '' ? null : String(brand).trim(),
            price,
            cost: price,
            stock,
            minStock: 1,
            maxStock: null,
            unit: 'unidad',
            isActive: true
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

