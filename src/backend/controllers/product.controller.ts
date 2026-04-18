import { Request, Response } from 'express'
import { prisma } from '../db'
import type { AuthRequest } from '../middleware/auth.middleware'
import { loadWorkbookFromBuffer, worksheetToObjects } from '../utils/spreadsheet'
import { notifyAdminsAboutResourceCreation } from '../utils/notifications'

const buildSearchTerms = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)

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

type ExistingProductImportRecord = {
  id: string
  sku: string
}

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, isActive, category } = req.query

    const where: any = {}

    if (typeof search === 'string' && search.trim()) {
      const searchTerms = buildSearchTerms(search)

      where.AND = searchTerms.map((term) => ({
        OR: [
          { name: { contains: term } },
          { sku: { contains: term } },
          { barcode: { contains: term } },
          { brand: { contains: term } },
          { category: { contains: term } },
          { description: { contains: term } }
        ]
      }))
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

export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const data = req.body

    const product = await prisma.product.create({
      data
    })

    await notifyAdminsAboutResourceCreation(req.user, 'product', 1)

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

export const importProductsFromExcel = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const workbook = await loadWorkbookFromBuffer(req.file.buffer)
    const worksheet = workbook.worksheets[0]

    if (!worksheet) {
      return res.status(400).json({ error: 'No worksheet found in the uploaded file' })
    }

    const data = worksheetToObjects(worksheet)

    const results = {
      success: 0,
      created: 0,
      updated: 0,
      errors: [] as any[],
      skipped: 0
    }
    const existingProducts = await prisma.product.findMany({
      select: {
        id: true,
        sku: true
      }
    })
    const productsBySku = new Map<string, ExistingProductImportRecord>()
    existingProducts.forEach((product) => {
      productsBySku.set(product.sku, product)
    })
    const processedSkus = new Set<string>()

    // Procesar cada fila
    for (let i = 0; i < data.length; i++) {
      const row: any = data[i]

      try {
        const legacyId = row.ID ?? row.id ?? row.sku ?? row.SKU
        const brand = row.Marca ?? row.marca ?? null
        const family = row.Familia ?? row.familia ?? row.Categoria ?? row.categoria
        const productDescription =
          row['Descripción'] ?? row.Descripcion ?? row.descripcion ?? row.Nombre ?? row.nombre
        const quantityRaw = row.Cantidad ?? row.cantidad ?? row.Stock ?? row.stock
        const pvpRaw = row.PVP ?? row.pvp ?? row.Precio ?? row.precio

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

        if (processedSkus.has(sku)) {
          results.skipped++
          continue
        }

        const normalizedBrand =
          brand === null || brand === undefined || String(brand).trim() === '' ? null : String(brand).trim()
        const normalizedName = String(productDescription).trim()
        const normalizedCategory = String(family).trim()
        const existingProduct = productsBySku.get(sku)

        if (existingProduct) {
          await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              name: normalizedName,
              category: normalizedCategory,
              price,
              stock,
              isActive: true,
              ...(normalizedBrand ? { brand: normalizedBrand } : {})
            }
          })
          results.updated++
        } else {
          const createdProduct = await prisma.product.create({
            data: {
              name: normalizedName,
              description: null,
              sku,
              barcode: null,
              category: normalizedCategory,
              brand: normalizedBrand,
              price,
              cost: price,
              stock,
              minStock: 1,
              maxStock: null,
              unit: 'unidad',
              isActive: true
            }
          })
          productsBySku.set(sku, {
            id: createdProduct.id,
            sku: createdProduct.sku
          })
          results.created++
        }

        processedSkus.add(sku)
        results.success++
      } catch (error: any) {
        results.errors.push({
          row: i + 2,
          error: error.message
        })
        results.skipped++
      }
    }

    await notifyAdminsAboutResourceCreation(req.user, 'product', results.created)

    res.json({
      message: 'Import completed',
      results
    })
  } catch (error) {
    console.error('Import products error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

