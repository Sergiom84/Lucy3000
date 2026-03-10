import { PaymentMethod, Prisma, SaleStatus } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { buildInclusiveDateRange } from '../utils/date-range'

class BusinessError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

type SaleItemInput = {
  productId?: string | null
  serviceId?: string | null
  description: string
  quantity: number
  price: number
}

type TxClient = Prisma.TransactionClient

const SALE_STATUSES: SaleStatus[] = ['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED']
const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'BIZUM', 'OTHER']

const saleInclude = {
  client: true,
  appointment: {
    include: {
      service: true,
      client: true
    }
  },
  user: {
    select: { id: true, name: true }
  },
  items: {
    include: {
      product: true,
      service: true
    }
  },
  cashMovement: true
} satisfies Prisma.SaleInclude

const ensureValidSaleItems = (items: unknown): SaleItemInput[] => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BusinessError(400, 'Sale must include at least one item')
  }

  return items.map((item) => {
    const row = item as SaleItemInput
    const quantity = Number(row.quantity)
    const price = Number(row.price)

    if (!row.description || !String(row.description).trim()) {
      throw new BusinessError(400, 'Each item requires a description')
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BusinessError(400, 'Each item requires a positive quantity')
    }

    if (!Number.isFinite(price) || price < 0) {
      throw new BusinessError(400, 'Each item requires a valid price')
    }

    return {
      productId: row.productId || null,
      serviceId: row.serviceId || null,
      description: String(row.description).trim(),
      quantity,
      price
    }
  })
}

const calculateTotals = (items: SaleItemInput[], discount: number, tax: number) => {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const total = subtotal - discount + tax

  if (total < 0) {
    throw new BusinessError(400, 'Sale total cannot be negative')
  }

  return { subtotal, total }
}

const buildSaleNumber = async (tx: TxClient): Promise<string> => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(3001001)`

  const lastSale = await tx.sale.findFirst({
    select: { saleNumber: true },
    orderBy: { saleNumber: 'desc' }
  })

  const next = lastSale?.saleNumber.match(/^V-(\d{6,})$/)
    ? Number(lastSale.saleNumber.split('-')[1]) + 1
    : 1

  return `V-${next.toString().padStart(6, '0')}`
}

const getOpenCashRegister = async (tx: TxClient) =>
  tx.cashRegister.findFirst({
    where: { status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
    select: { id: true }
  })

const syncAutomaticCashMovement = async (
  tx: TxClient,
  payload: {
    saleId: string
    saleNumber: string
    clientName: string
    userId: string
    total: number
    paymentMethod: PaymentMethod
    deleteOnly?: boolean
  }
) => {
  const existing = await tx.cashMovement.findUnique({
    where: { saleId: payload.saleId }
  })

  if (payload.deleteOnly) {
    if (existing) {
      await tx.cashMovement.delete({
        where: { saleId: payload.saleId }
      })
    }
    return
  }

  const description = payload.clientName
    ? `Venta ${payload.saleNumber} · ${payload.clientName}`
    : `Venta ${payload.saleNumber}`

  if (existing) {
    await tx.cashMovement.update({
      where: { saleId: payload.saleId },
      data: {
        type: 'INCOME',
        paymentMethod: payload.paymentMethod,
        amount: payload.total,
        category: 'Ventas',
        description,
        reference: payload.saleNumber
      }
    })
    return
  }

  const openCashRegister = await getOpenCashRegister(tx)
  if (!openCashRegister) return

  await tx.cashMovement.create({
    data: {
      cashRegisterId: openCashRegister.id,
      userId: payload.userId,
      saleId: payload.saleId,
      type: 'INCOME',
      paymentMethod: payload.paymentMethod,
      amount: payload.total,
      category: 'Ventas',
      description,
      reference: payload.saleNumber
    }
  })
}

const applySaleEffects = async (
  tx: TxClient,
  payload: {
    saleId: string
    saleNumber: string
    clientId: string | null
    clientName: string
    userId: string
    appointmentId: string | null
    total: number
    paymentMethod: PaymentMethod
    items: SaleItemInput[]
  }
) => {
  for (const item of payload.items) {
    if (!item.productId) continue

    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: { id: true, name: true, stock: true }
    })

    if (!product) {
      throw new BusinessError(404, `Product ${item.productId} not found`)
    }

    if (product.stock < item.quantity) {
      throw new BusinessError(400, `Insufficient stock for "${product.name}"`)
    }

    await tx.product.update({
      where: { id: item.productId },
      data: {
        stock: {
          decrement: item.quantity
        }
      }
    })

    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        type: 'SALE',
        quantity: item.quantity,
        reference: payload.saleNumber
      }
    })
  }

  if (payload.clientId) {
    const pointsEarned = Math.floor(payload.total / 10)
    await tx.client.update({
      where: { id: payload.clientId },
      data: {
        loyaltyPoints: {
          increment: pointsEarned
        },
        totalSpent: {
          increment: payload.total
        }
      }
    })
  }

  if (payload.appointmentId) {
    await tx.appointment.update({
      where: { id: payload.appointmentId },
      data: { status: 'COMPLETED' }
    })
  }

  await syncAutomaticCashMovement(tx, {
    saleId: payload.saleId,
    saleNumber: payload.saleNumber,
    clientName: payload.clientName,
    userId: payload.userId,
    total: payload.total,
    paymentMethod: payload.paymentMethod
  })
}

const rollbackSaleEffects = async (
  tx: TxClient,
  payload: {
    saleId: string
    saleNumber: string
    clientId: string | null
    total: number
    items: SaleItemInput[]
  }
) => {
  for (const item of payload.items) {
    if (!item.productId) continue

    await tx.product.update({
      where: { id: item.productId },
      data: {
        stock: {
          increment: item.quantity
        }
      }
    })

    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        type: 'RETURN',
        quantity: item.quantity,
        reference: payload.saleNumber
      }
    })
  }

  if (payload.clientId) {
    const pointsEarned = Math.floor(payload.total / 10)
    await tx.client.update({
      where: { id: payload.clientId },
      data: {
        loyaltyPoints: {
          decrement: pointsEarned
        },
        totalSpent: {
          decrement: payload.total
        }
      }
    })
  }

  await syncAutomaticCashMovement(tx, {
    saleId: payload.saleId,
    saleNumber: payload.saleNumber,
    clientName: '',
    userId: '',
    total: payload.total,
    paymentMethod: 'CASH',
    deleteOnly: true
  })
}

const toHttpError = (error: unknown) => {
  if (error instanceof BusinessError) {
    return { statusCode: error.statusCode, message: error.message }
  }

  return { statusCode: 500, message: 'Internal server error' }
}

const normalizeItemsFromSale = (items: { productId: string | null; serviceId: string | null; description: string; quantity: number; price: Prisma.Decimal }[]) =>
  items.map((item) => ({
    productId: item.productId,
    serviceId: item.serviceId,
    description: item.description,
    quantity: item.quantity,
    price: Number(item.price)
  }))

export const getSales = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, clientId, appointmentId, paymentMethod, status } = req.query

    const where: Prisma.SaleWhereInput = {}

    if (startDate && endDate) {
      where.date = buildInclusiveDateRange(startDate as string, endDate as string)
    }

    if (clientId) where.clientId = clientId as string
    if (appointmentId) where.appointmentId = appointmentId as string
    if (paymentMethod) where.paymentMethod = paymentMethod as PaymentMethod
    if (status) where.status = status as SaleStatus

    const sales = await prisma.sale.findMany({
      where,
      include: saleInclude,
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
      include: saleInclude
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
    const { clientId, appointmentId, items, discount, tax, paymentMethod, notes } = req.body

    if (!req.user?.id) {
      throw new BusinessError(401, 'Unauthorized')
    }

    if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
      throw new BusinessError(400, 'Invalid payment method')
    }

    const normalizedItems = ensureValidSaleItems(items)
    const discountValue = Number(discount) || 0
    const taxValue = Number(tax) || 0
    const { subtotal, total } = calculateTotals(normalizedItems, discountValue, taxValue)

    const sale = await prisma.$transaction(async (tx) => {
      let resolvedClientId = clientId || null
      let appointmentClientName = ''

      if (appointmentId) {
        const appointment = await tx.appointment.findUnique({
          where: { id: appointmentId },
          select: {
            id: true,
            clientId: true,
            client: {
              select: {
                firstName: true,
                lastName: true
              }
            },
            sale: {
              select: {
                id: true,
                status: true
              }
            }
          }
        })

        if (!appointment) {
          throw new BusinessError(404, 'Appointment not found')
        }

        if (appointment.sale?.status === 'COMPLETED') {
          throw new BusinessError(400, 'This appointment already has a completed sale')
        }

        if (resolvedClientId && resolvedClientId !== appointment.clientId) {
          throw new BusinessError(400, 'Appointment and sale client must match')
        }

        resolvedClientId = appointment.clientId
        appointmentClientName = `${appointment.client.firstName} ${appointment.client.lastName}`.trim()
      }

      const saleNumber = await buildSaleNumber(tx)

      const createdSale = await tx.sale.create({
        data: {
          clientId: resolvedClientId,
          appointmentId: appointmentId || null,
          userId: req.user!.id,
          saleNumber,
          subtotal,
          discount: discountValue,
          tax: taxValue,
          total,
          paymentMethod,
          status: 'COMPLETED',
          notes: notes || null,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId || null,
              serviceId: item.serviceId || null,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.quantity * item.price
            }))
          }
        },
        include: {
          client: true,
          items: true
        }
      })

      const clientName = createdSale.client
        ? `${createdSale.client.firstName} ${createdSale.client.lastName}`.trim()
        : appointmentClientName

      await applySaleEffects(tx, {
        saleId: createdSale.id,
        saleNumber,
        clientId: createdSale.clientId,
        clientName,
        userId: req.user!.id,
        appointmentId: createdSale.appointmentId,
        total,
        paymentMethod,
        items: normalizedItems
      })

      return tx.sale.findUnique({
        where: { id: createdSale.id },
        include: saleInclude
      })
    })

    res.status(201).json(sale)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Create sale error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const updateSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status, paymentMethod, notes } = req.body

    const blockedFields = [
      'items',
      'subtotal',
      'discount',
      'tax',
      'total',
      'clientId',
      'userId',
      'saleNumber',
      'appointmentId'
    ]
    const hasBlockedFields = blockedFields.some((field) => field in req.body)
    if (hasBlockedFields) {
      throw new BusinessError(400, 'Updating sale lines or links is not supported')
    }

    if (status && !SALE_STATUSES.includes(status as SaleStatus)) {
      throw new BusinessError(400, 'Invalid sale status')
    }

    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
      throw new BusinessError(400, 'Invalid payment method')
    }

    const updatedSale = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          client: true,
          items: true
        }
      })

      if (!sale) {
        throw new BusinessError(404, 'Sale not found')
      }

      const nextStatus = (status || sale.status) as SaleStatus
      const nextPaymentMethod = (paymentMethod || sale.paymentMethod) as PaymentMethod
      const normalizedItems = normalizeItemsFromSale(sale.items)

      if (sale.status === 'COMPLETED' && nextStatus !== 'COMPLETED') {
        await rollbackSaleEffects(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          total: Number(sale.total),
          items: normalizedItems
        })
      }

      const persisted = await tx.sale.update({
        where: { id },
        data: {
          status: nextStatus,
          paymentMethod: nextPaymentMethod,
          notes: notes ?? sale.notes
        },
        include: {
          client: true
        }
      })

      if (sale.status !== 'COMPLETED' && nextStatus === 'COMPLETED') {
        await applySaleEffects(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          clientName: persisted.client ? `${persisted.client.firstName} ${persisted.client.lastName}`.trim() : '',
          userId: sale.userId,
          appointmentId: sale.appointmentId,
          total: Number(sale.total),
          paymentMethod: nextPaymentMethod,
          items: normalizedItems
        })
      } else if (sale.status === 'COMPLETED' && nextStatus === 'COMPLETED' && nextPaymentMethod !== sale.paymentMethod) {
        await syncAutomaticCashMovement(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientName: persisted.client ? `${persisted.client.firstName} ${persisted.client.lastName}`.trim() : '',
          userId: sale.userId,
          total: Number(sale.total),
          paymentMethod: nextPaymentMethod
        })
      }

      return tx.sale.findUnique({
        where: { id },
        include: saleInclude
      })
    })

    res.json(updatedSale)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Update sale error:', error)
    res.status(statusCode).json({ error: message })
  }
}

export const deleteSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          items: true
        }
      })

      if (!sale) {
        throw new BusinessError(404, 'Sale not found')
      }

      if (sale.status === 'COMPLETED') {
        await rollbackSaleEffects(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          total: Number(sale.total),
          items: normalizeItemsFromSale(sale.items)
        })
      }

      await tx.sale.delete({
        where: { id }
      })
    })

    res.json({ message: 'Sale deleted successfully' })
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Delete sale error:', error)
    res.status(statusCode).json({ error: message })
  }
}
