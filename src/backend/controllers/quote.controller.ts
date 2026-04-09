import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { withPostgresSequenceLock } from '../utils/sequence-lock'

type TxClient = Prisma.TransactionClient

const quoteInclude = {
  client: true,
  items: {
    include: {
      product: true,
      service: true
    }
  }
} satisfies Prisma.QuoteInclude

const buildQuoteNumber = async (tx: TxClient): Promise<string> => {
  return withPostgresSequenceLock(tx, 3001002, async () => {
    const lastQuote = await tx.quote.findFirst({
      select: { quoteNumber: true },
      orderBy: { quoteNumber: 'desc' }
    })

    const next = lastQuote?.quoteNumber.match(/^P-(\d{6,})$/)
      ? Number(lastQuote.quoteNumber.split('-')[1]) + 1
      : 1

    return `P-${next.toString().padStart(6, '0')}`
  })
}

export const createQuote = async (req: Request, res: Response) => {
  try {
    const { clientId, professional, items, discount, notes } = req.body

    if (!clientId) {
      return res.status(400).json({ error: 'Se requiere un cliente para generar un presupuesto' })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El presupuesto debe incluir al menos un item' })
    }

    const validItems = items.map((item: any) => ({
      productId: item.productId || null,
      serviceId: item.serviceId || null,
      description: String(item.description || '').trim(),
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0
    }))

    const subtotal = validItems.reduce((sum: number, item: any) => sum + item.quantity * item.price, 0)
    const discountAmount = Number(discount) || 0
    const total = Math.max(0, subtotal - discountAmount)

    const validUntil = new Date()
    validUntil.setMonth(validUntil.getMonth() + 3)

    const quote = await prisma.$transaction(async (tx) => {
      const quoteNumber = await buildQuoteNumber(tx)

      return tx.quote.create({
        data: {
          quoteNumber,
          clientId,
          professional: professional || 'LUCY',
          validUntil,
          subtotal,
          discount: discountAmount,
          total,
          notes: notes || null,
          items: {
            create: validItems.map((item: any) => ({
              productId: item.productId,
              serviceId: item.serviceId,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.quantity * item.price
            }))
          }
        },
        include: quoteInclude
      })
    })

    res.status(201).json(quote)
  } catch (error) {
    console.error('Error creating quote:', error)
    res.status(500).json({ error: 'Error al crear el presupuesto' })
  }
}

export const getQuotesByClient = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params

    const quotes = await prisma.quote.findMany({
      where: { clientId },
      include: quoteInclude,
      orderBy: { date: 'desc' }
    })

    res.json(quotes)
  } catch (error) {
    console.error('Error fetching quotes:', error)
    res.status(500).json({ error: 'Error al obtener presupuestos' })
  }
}

export const getQuoteById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: quoteInclude
    })

    if (!quote) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' })
    }

    res.json(quote)
  } catch (error) {
    console.error('Error fetching quote:', error)
    res.status(500).json({ error: 'Error al obtener el presupuesto' })
  }
}

export const updateQuoteStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const validStatuses = ['ISSUED', 'ACCEPTED', 'EXPIRED', 'CANCELLED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' })
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: { status },
      include: quoteInclude
    })

    res.json(quote)
  } catch (error) {
    console.error('Error updating quote status:', error)
    res.status(500).json({ error: 'Error al actualizar el presupuesto' })
  }
}

export const deleteQuote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.quote.delete({ where: { id } })

    res.json({ message: 'Presupuesto eliminado' })
  } catch (error) {
    console.error('Error deleting quote:', error)
    res.status(500).json({ error: 'Error al eliminar el presupuesto' })
  }
}
