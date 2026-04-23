import { Prisma } from '@prisma/client'
import type { BonoTemplate } from '../bonos/templateCatalog'

export class BusinessError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

export type SaleItemInput = {
  productId?: string | null
  serviceId?: string | null
  bonoTemplateId?: string | null
  description: string
  quantity: number
  price: number
}

export type AccountBalanceUsageInput = {
  operationDate: Date
  referenceItem: string
  amount: number
  notes?: string | null
}

export type CombinedPaymentInput = {
  primaryMethod: string
  primaryAmount: number
  secondaryMethod: string
  cashShowInOfficialCash?: boolean
}

export type StoredPaymentBreakdownEntry = {
  paymentMethod: string
  amount: number
  showInOfficialCash?: boolean
}

export type TxClient = Prisma.TransactionClient

export type SaleBonoMatch = {
  item: SaleItemInput
  template: BonoTemplate
}

export const SALE_STATUSES: string[] = ['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED']
export const PAYMENT_METHODS: string[] = ['CASH', 'CARD', 'BIZUM', 'ABONO', 'OTHER']
export const PENDING_PAYMENT_STATUSES: string[] = ['OPEN', 'SETTLED', 'CANCELLED']
export const SETTLED_PENDING_PAYMENT_METHODS: string[] = ['CASH', 'CARD', 'BIZUM', 'ABONO', 'OTHER']
export const COMBINED_PAYMENT_METHODS: string[] = ['CASH', 'CARD', 'BIZUM', 'ABONO']

export const isAccountBalancePaymentMethod = (paymentMethod: string) =>
  ['ABONO', 'OTHER'].includes(String(paymentMethod || '').toUpperCase())

export const saleInclude = {
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
  pendingPayment: {
    include: {
      collections: {
        orderBy: [{ operationDate: 'desc' as const }, { createdAt: 'desc' as const }]
      }
    }
  },
  accountBalanceMovements: {
    orderBy: [{ operationDate: 'desc' as const }, { createdAt: 'desc' as const }],
    select: {
      id: true,
      type: true,
      operationDate: true,
      amount: true,
      balanceAfter: true,
      referenceItem: true,
      notes: true
    }
  },
  cashMovement: true
} satisfies Prisma.SaleInclude

export const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export const buildAccountBalanceReference = (items: SaleItemInput[]): string => {
  const reference = items
    .map((item) => `${item.description}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
    .join(', ')
    .trim()

  return reference.slice(0, 250) || 'Venta en caja'
}

export const normalizeItemsFromSale = (
  items: {
    productId: string | null
    serviceId: string | null
    description: string
    quantity: number
    price: Prisma.Decimal
  }[]
) =>
  items.map((item) => ({
    productId: item.productId,
    serviceId: item.serviceId,
    description: item.description,
    quantity: item.quantity,
    price: Number(item.price)
  }))

export const getAppointmentSaleConflictMessage = (sale: { saleNumber?: string | null; status?: string | null }) => {
  const saleNumberLabel = sale.saleNumber ? ` ${sale.saleNumber}` : ''
  const saleStatus = String(sale.status || '').toUpperCase()

  if (saleStatus === 'COMPLETED') {
    return `This appointment already has the completed sale${saleNumberLabel}`
  }

  if (saleStatus === 'PENDING') {
    return `This appointment already has the pending sale${saleNumberLabel}. Open it from sales to continue the collection.`
  }

  return `This appointment already has the linked sale${saleNumberLabel}. Open it from sales history before creating a new sale.`
}

export const toHttpError = (error: unknown) => {
  if (error instanceof BusinessError) {
    return { statusCode: error.statusCode, message: error.message }
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const targets = Array.isArray(error.meta?.target) ? error.meta.target.map((target) => String(target)) : []
    if (targets.includes('appointmentId')) {
      return {
        statusCode: 409,
        message: 'This appointment already has a linked sale. Open it from sales history before creating a new sale.'
      }
    }
  }

  return { statusCode: 500, message: 'Internal server error' }
}
