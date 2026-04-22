import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'
import { prisma } from '../db'
import { AuthRequest } from '../middleware/auth.middleware'
import { buildInclusiveDateRange } from '../utils/date-range'
import { adjustClientPendingAmount } from '../utils/clientDebt'
import { getAppointmentDisplayName, getSaleDisplayName } from '../utils/customer-display'
import { withPostgresSequenceLock } from '../utils/sequence-lock'

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
  bonoTemplateId?: string | null
  description: string
  quantity: number
  price: number
}

type AccountBalanceUsageInput = {
  operationDate: Date
  referenceItem: string
  amount: number
  notes?: string | null
}

type CombinedPaymentInput = {
  primaryMethod: string
  primaryAmount: number
  secondaryMethod: string
  cashShowInOfficialCash?: boolean
}

type StoredPaymentBreakdownEntry = {
  paymentMethod: string
  amount: number
  showInOfficialCash?: boolean
}

type CashMovementEntry = {
  paymentMethod: string
  amount: number
  showInOfficialCash: boolean
}

type TxClient = Prisma.TransactionClient

type BonoTemplate = {
  id: string
  category: string
  description: string
  serviceId: string
  serviceName: string
  serviceLookup: string
  totalSessions: number
  price: number
  isActive: boolean
  createdAt: string
}

type SaleBonoMatch = {
  item: SaleItemInput
  template: BonoTemplate
}

const SALE_STATUSES: string[] = ['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED']
const PAYMENT_METHODS: string[] = ['CASH', 'CARD', 'BIZUM', 'ABONO', 'OTHER']
const PENDING_PAYMENT_STATUSES: string[] = ['OPEN', 'SETTLED', 'CANCELLED']
const SETTLED_PENDING_PAYMENT_METHODS: string[] = ['CASH', 'CARD', 'BIZUM', 'ABONO', 'OTHER']
const COMBINED_PAYMENT_METHODS: string[] = ['CASH', 'CARD', 'BIZUM', 'ABONO']
const BONO_TEMPLATES_SETTING_KEY = 'bono_templates_catalog'
const isAccountBalancePaymentMethod = (paymentMethod: string) =>
  ['ABONO', 'OTHER'].includes(String(paymentMethod || '').toUpperCase())

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
      bonoTemplateId: row.bonoTemplateId || null,
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

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

const parseOptionalDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const serializePaymentBreakdown = (entries: StoredPaymentBreakdownEntry[]) => {
  if (entries.length === 0) {
    return null
  }

  return JSON.stringify(
    entries.map((entry) => ({
      paymentMethod: entry.paymentMethod,
      amount: roundCurrency(entry.amount),
      ...(entry.showInOfficialCash === undefined ? {} : { showInOfficialCash: entry.showInOfficialCash })
    }))
  )
}

const normalizeCombinedPayment = (combinedPayment: unknown, total: number) => {
  if (!combinedPayment || typeof combinedPayment !== 'object') {
    return null
  }

  const row = combinedPayment as CombinedPaymentInput
  const primaryMethod = String(row.primaryMethod || '').trim().toUpperCase()
  const secondaryMethod = String(row.secondaryMethod || '').trim().toUpperCase()
  const primaryAmount = roundCurrency(Number(row.primaryAmount))
  const cashShowInOfficialCash = row.cashShowInOfficialCash !== false

  if (!COMBINED_PAYMENT_METHODS.includes(primaryMethod)) {
    throw new BusinessError(400, 'Invalid combined primary payment method')
  }

  if (![...COMBINED_PAYMENT_METHODS, 'PENDING'].includes(secondaryMethod)) {
    throw new BusinessError(400, 'Invalid combined secondary payment method')
  }

  if (!Number.isFinite(primaryAmount) || primaryAmount <= 0 || primaryAmount >= total) {
    throw new BusinessError(400, 'Combined primary payment amount must be greater than zero and lower than total')
  }

  if (secondaryMethod !== 'PENDING' && secondaryMethod === primaryMethod) {
    throw new BusinessError(400, 'Combined payment methods must be different')
  }

  const secondaryAmount = roundCurrency(total - primaryAmount)
  if (secondaryAmount <= 0) {
    throw new BusinessError(400, 'Combined secondary payment amount must be greater than zero')
  }

  const buildStoredEntry = (paymentMethod: string, amount: number): StoredPaymentBreakdownEntry => ({
    paymentMethod,
    amount,
    ...(paymentMethod === 'CASH' ? { showInOfficialCash: cashShowInOfficialCash } : {})
  })

  const collectedEntries: StoredPaymentBreakdownEntry[] = [
    buildStoredEntry(primaryMethod, primaryAmount),
    ...(secondaryMethod === 'PENDING' ? [] : [buildStoredEntry(secondaryMethod, secondaryAmount)])
  ]

  const accountBalanceAmount = roundCurrency(
    collectedEntries.reduce((sum, entry) => sum + (entry.paymentMethod === 'ABONO' ? entry.amount : 0), 0)
  )
  const cashEntry = collectedEntries.find((entry) => entry.paymentMethod === 'CASH') || null
  const officialCommercialAmount = roundCurrency(
    collectedEntries.reduce((sum, entry) => {
      if (entry.paymentMethod === 'ABONO') {
        return sum
      }

      if (entry.paymentMethod === 'CASH' && entry.showInOfficialCash === false) {
        return sum
      }

      return sum + entry.amount
    }, 0)
  )
  const commercialCollectedAmount = roundCurrency(
    collectedEntries.reduce((sum, entry) => sum + (entry.paymentMethod === 'ABONO' ? 0 : entry.amount), 0)
  )

  return {
    primaryMethod,
    secondaryMethod,
    primaryAmount,
    secondaryAmount,
    collectedEntries,
    accountBalanceAmount,
    officialCommercialAmount,
    pendingAmount: secondaryMethod === 'PENDING' ? secondaryAmount : 0,
    cashMovement:
      cashEntry || commercialCollectedAmount <= 0
        ? cashEntry
          ? {
              paymentMethod: 'CASH',
              amount: cashEntry.amount,
              showInOfficialCash: cashEntry.showInOfficialCash !== false
            }
          : null
        : {
            paymentMethod: 'OTHER',
            amount: commercialCollectedAmount,
            showInOfficialCash: true
          }
  }
}

const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const readBonoTemplates = async () => {
  const setting = await prisma.setting.findUnique({
    where: { key: BONO_TEMPLATES_SETTING_KEY }
  })

  if (!setting) return [] as BonoTemplate[]

  try {
    const parsed = JSON.parse(setting.value)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((template) => {
        const row = template as Partial<BonoTemplate>

        return {
          id: String(row.id || '').trim(),
          category: String(row.category || '').trim(),
          description: String(row.description || '').trim(),
          serviceId: String(row.serviceId || '').trim(),
          serviceName: String(row.serviceName || '').trim(),
          serviceLookup: String(row.serviceLookup || '').trim(),
          totalSessions: Number(row.totalSessions) || 0,
          price: roundCurrency(Number(row.price) || 0),
          isActive: row.isActive !== false,
          createdAt: String(row.createdAt || new Date().toISOString())
        }
      })
      .filter(
        (template) =>
          template.isActive !== false &&
          Boolean(template.id) &&
          Boolean(template.description) &&
          Boolean(template.serviceId) &&
          template.totalSessions > 0
      )
  } catch {
    return []
  }
}

const findBonoTemplateForItem = (item: SaleItemInput, templates: BonoTemplate[]) => {
  if (item.bonoTemplateId) {
    const explicitTemplate = templates.find((template) => template.id === item.bonoTemplateId)
    if (!explicitTemplate) {
      throw new BusinessError(400, `Bono template ${item.bonoTemplateId} not found`)
    }

    return explicitTemplate
  }

  const normalizedDescription = normalizeSearchText(item.description)
  const normalizedServiceId = normalizeSearchText(item.serviceId || '')
  const normalizedPrice = roundCurrency(Number(item.price) || 0)

  return (
    templates.find(
      (template) =>
        normalizeSearchText(template.description) === normalizedDescription &&
        normalizeSearchText(template.serviceId) === normalizedServiceId &&
        roundCurrency(Number(template.price) || 0) === normalizedPrice
    ) || null
  )
}

const getBonoMatchesForSale = (items: SaleItemInput[], templates: BonoTemplate[]): SaleBonoMatch[] =>
  items
    .map((item) => {
      const template = findBonoTemplateForItem(item, templates)
      return template ? { item, template } : null
    })
    .filter((entry): entry is SaleBonoMatch => Boolean(entry))

const buildBonoPackNotes = (saleId: string, saleNumber: string, notes?: string | null) => {
  const marker = `BONO_SALE:${saleId}`
  const parts = [marker, `Venta ${saleNumber}`, notes?.trim()].filter(Boolean)
  return parts.join(' | ')
}

const createBonoPacksForSale = async (
  tx: TxClient,
  payload: {
    saleId: string
    saleNumber: string
    clientId: string | null
    notes?: string | null
    matches: SaleBonoMatch[]
  }
) => {
  if (payload.matches.length === 0) return

  if (!payload.clientId) {
    throw new BusinessError(400, 'Sales with bonos require a client')
  }

  const packNotes = buildBonoPackNotes(payload.saleId, payload.saleNumber, payload.notes)

  for (const match of payload.matches) {
    for (let index = 0; index < match.item.quantity; index += 1) {
      await tx.bonoPack.create({
        data: {
          clientId: payload.clientId,
          name: match.template.description,
          serviceId: match.template.serviceId,
          bonoTemplateId: match.template.id,
          totalSessions: match.template.totalSessions,
          price: match.template.price,
          notes: packNotes,
          sessions: {
            create: Array.from({ length: match.template.totalSessions }, (_, sessionIndex) => ({
              sessionNumber: sessionIndex + 1
            }))
          }
        }
      })
    }
  }
}

const deleteBonoPacksForSale = async (tx: TxClient, saleId: string) => {
  const marker = `BONO_SALE:${saleId}`
  const packs = await tx.bonoPack.findMany({
    where: {
      notes: {
        contains: marker
      }
    },
    select: { id: true }
  })

  await Promise.all(packs.map((pack) => tx.bonoPack.delete({ where: { id: pack.id } })))
}

const buildAccountBalanceReference = (items: SaleItemInput[]): string => {
  const reference = items
    .map((item) => `${item.description}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
    .join(', ')
    .trim()

  return reference.slice(0, 250) || 'Venta en caja'
}

const buildSaleNumber = async (tx: TxClient): Promise<string> => {
  return withPostgresSequenceLock(tx, 3001001, async () => {
    const lastSale = await tx.sale.findFirst({
      select: { saleNumber: true },
      orderBy: { saleNumber: 'desc' }
    })

    const next = lastSale?.saleNumber.match(/^V-(\d{6,})$/)
      ? Number(lastSale.saleNumber.split('-')[1]) + 1
      : 1

    return `V-${next.toString().padStart(6, '0')}`
  })
}

const getOpenCashRegister = async (tx: TxClient) =>
  tx.cashRegister.findFirst({
    where: { status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
    select: { id: true }
  })

const shouldRecordOfficialCashFlow = (paymentMethod: string, showInOfficialCash = true) => {
  if (String(paymentMethod || '').toUpperCase() !== 'CASH') {
    return true
  }

  return showInOfficialCash !== false
}

const syncAutomaticCashMovement = async (
  tx: TxClient,
  payload: {
    saleId: string
    saleNumber: string
    clientName: string
    userId: string
    total: number
    cashAmount?: number
    paymentMethod: string
    showInOfficialCash?: boolean
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

  if (payload.showInOfficialCash === false) {
    if (existing) {
      await tx.cashMovement.delete({
        where: { saleId: payload.saleId }
      })
    }
    return
  }

  const movementAmount = roundCurrency(
    Number.isFinite(payload.cashAmount) ? Math.max(0, Number(payload.cashAmount)) : Number(payload.total)
  )

  if (movementAmount <= 0) {
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
        amount: movementAmount,
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
      amount: movementAmount,
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
    cashMovementTotal?: number
    paymentMethod: string
    cashMovementPaymentMethod?: string
    cashMovementShowInOfficialCash?: boolean
    showInOfficialCash: boolean
    items: SaleItemInput[]
    skipAutomaticCashMovement?: boolean
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

  if (!payload.skipAutomaticCashMovement) {
    await syncAutomaticCashMovement(tx, {
      saleId: payload.saleId,
      saleNumber: payload.saleNumber,
      clientName: payload.clientName,
      userId: payload.userId,
      total: payload.total,
      cashAmount: payload.cashMovementTotal,
      paymentMethod: payload.cashMovementPaymentMethod || payload.paymentMethod,
      showInOfficialCash:
        payload.cashMovementShowInOfficialCash === undefined
          ? payload.showInOfficialCash
          : payload.cashMovementShowInOfficialCash
    })
  }
}

const applyAccountBalanceUsage = async (
  tx: TxClient,
  payload: {
    clientId: string
    saleId: string
    saleNumber: string
    usage: AccountBalanceUsageInput
  }
) => {
  const client = await tx.client.findUnique({
    where: { id: payload.clientId },
    select: {
      id: true,
      accountBalance: true
    }
  })

  if (!client) {
    throw new BusinessError(404, 'Client not found')
  }

  const currentBalance = Number(client.accountBalance || 0)
  if (currentBalance < payload.usage.amount) {
    throw new BusinessError(400, 'Insufficient account balance')
  }

  const nextBalance = Math.round((currentBalance - payload.usage.amount + Number.EPSILON) * 100) / 100

  await tx.client.update({
    where: { id: payload.clientId },
    data: {
      accountBalance: nextBalance
    }
  })

  await tx.accountBalanceMovement.create({
    data: {
      clientId: payload.clientId,
      saleId: payload.saleId,
      type: 'CONSUMPTION',
      operationDate: payload.usage.operationDate,
      description: `Consumo en venta ${payload.saleNumber}`,
      referenceItem: payload.usage.referenceItem,
      amount: payload.usage.amount,
      balanceAfter: nextBalance,
      notes: payload.usage.notes || null
    }
  })
}

const createStandaloneCashMovement = async (
  tx: TxClient,
  payload: {
    saleNumber: string
    clientName: string
    userId: string
    amount: number
    paymentMethod: string
    showInOfficialCash?: boolean
    date: Date
  }
) => {
  if (!shouldRecordOfficialCashFlow(payload.paymentMethod, payload.showInOfficialCash)) {
    return
  }

  const movementAmount = roundCurrency(Number(payload.amount) || 0)
  if (movementAmount <= 0) return

  const openCashRegister = await getOpenCashRegister(tx)
  if (!openCashRegister) return

  const description = payload.clientName
    ? `Cobro pendiente ${payload.saleNumber} · ${payload.clientName}`
    : `Cobro pendiente ${payload.saleNumber}`

  await tx.cashMovement.create({
    data: {
      cashRegisterId: openCashRegister.id,
      userId: payload.userId,
      saleId: null,
      type: 'INCOME',
      paymentMethod: payload.paymentMethod,
      amount: movementAmount,
      category: 'Ventas',
      description,
      reference: payload.saleNumber,
      date: payload.date
    }
  })
}

const createPendingPayment = async (
  tx: TxClient,
  payload: {
    saleId: string
    clientId: string | null
    amount: number
    createdAt: Date
  }
) => {
  if (!payload.clientId) {
    throw new BusinessError(400, 'Pending sales require a client')
  }

  await tx.pendingPayment.create({
    data: {
      saleId: payload.saleId,
      clientId: payload.clientId,
      amount: payload.amount,
      createdAt: payload.createdAt
    }
  })

  await adjustClientPendingAmount(tx, {
    clientId: payload.clientId,
    delta: payload.amount
  })
}

const resolvePendingPayment = async (
  tx: TxClient,
  payload: {
    saleId: string
    resolutionStatus: 'SETTLED' | 'CANCELLED'
    settledAt?: Date | null
    settledPaymentMethod?: string | null
  }
) => {
  if (!PENDING_PAYMENT_STATUSES.includes(payload.resolutionStatus)) {
    throw new BusinessError(400, 'Invalid pending payment status')
  }

  const pendingPayment = await tx.pendingPayment.findUnique({
    where: { saleId: payload.saleId }
  })

  if (!pendingPayment || pendingPayment.status !== 'OPEN') {
    return pendingPayment
  }

  await tx.pendingPayment.update({
    where: { saleId: payload.saleId },
    data: {
      amount: payload.resolutionStatus === 'SETTLED' ? 0 : pendingPayment.amount,
      status: payload.resolutionStatus,
      settledAt: payload.resolutionStatus === 'SETTLED' ? payload.settledAt || new Date() : null,
      settledPaymentMethod:
        payload.resolutionStatus === 'SETTLED' ? payload.settledPaymentMethod || null : null
    }
  })

  await adjustClientPendingAmount(tx, {
    clientId: pendingPayment.clientId,
    delta: -Number(pendingPayment.amount),
    enableAlertOnPositive: false
  })

  return pendingPayment
}

const reopenPendingPayment = async (
  tx: TxClient,
  payload: {
    saleId: string
    clientId: string | null
    amount: number
    createdAt: Date
  }
) => {
  if (!payload.clientId) {
    throw new BusinessError(400, 'Pending sales require a client')
  }

  const existing = await tx.pendingPayment.findUnique({
    where: { saleId: payload.saleId }
  })

  if (!existing) {
    await createPendingPayment(tx, payload)
    return
  }

  if (existing.status === 'OPEN') {
    return
  }

  await tx.pendingPayment.update({
    where: { saleId: payload.saleId },
    data: {
      clientId: payload.clientId,
      amount: payload.amount,
      status: 'OPEN',
      settledAt: null,
      settledPaymentMethod: null,
      createdAt: payload.createdAt
    }
  })

  await adjustClientPendingAmount(tx, {
    clientId: payload.clientId,
    delta: payload.amount
  })
}

const collectPendingPayment = async (
  tx: TxClient,
  payload: {
    saleId: string
    userId: string
    amount: number
    paymentMethod: string
    operationDate: Date
    showInOfficialCash?: boolean
    accountBalanceUsageAmount?: number
  }
) => {
  const sale = await tx.sale.findUnique({
    where: { id: payload.saleId },
    include: {
      client: true,
      appointment: {
        select: {
          guestName: true
        }
      },
      items: true,
      pendingPayment: {
        include: {
          collections: {
            select: { id: true }
          }
        }
      }
    }
  })

  if (!sale) {
    throw new BusinessError(404, 'Sale not found')
  }

  if (sale.status !== 'PENDING') {
    throw new BusinessError(400, 'Only pending sales can register pending collections')
  }

  if (!sale.pendingPayment || sale.pendingPayment.status !== 'OPEN') {
    throw new BusinessError(400, 'This sale has no open pending payment')
  }

  const pendingOpenAmount = roundCurrency(Number(sale.pendingPayment.amount || 0))
  const collectionAmount = roundCurrency(Number(payload.amount || 0))
  const accountBalanceAmount = roundCurrency(Number(payload.accountBalanceUsageAmount || 0))
  const normalizedPaymentMethod = String(payload.paymentMethod || '').trim().toUpperCase()

  if (!Number.isFinite(collectionAmount) || collectionAmount <= 0) {
    throw new BusinessError(400, 'Pending collection amount must be greater than zero')
  }

  if (collectionAmount > pendingOpenAmount) {
    throw new BusinessError(400, 'Pending collection amount cannot be greater than the open pending amount')
  }

  if (!Number.isFinite(accountBalanceAmount) || accountBalanceAmount < 0) {
    throw new BusinessError(400, 'Account balance usage amount is invalid')
  }

  if (accountBalanceAmount > collectionAmount) {
    throw new BusinessError(400, 'Account balance usage amount cannot be greater than the pending collection amount')
  }

  const commercialAmount = roundCurrency(collectionAmount - accountBalanceAmount)

  if (normalizedPaymentMethod === 'ABONO' && commercialAmount > 0) {
    throw new BusinessError(400, 'Payment method ABONO requires full account balance coverage')
  }

  if (accountBalanceAmount > 0 && !sale.clientId) {
    throw new BusinessError(400, 'Account balance usage requires a client')
  }

  const normalizedItems = normalizeItemsFromSale(sale.items)
  const shouldShowInOfficialCash =
    normalizedPaymentMethod === 'CASH' ? payload.showInOfficialCash !== false : true

  if (accountBalanceAmount > 0 && sale.clientId) {
    await applyAccountBalanceUsage(tx, {
      clientId: sale.clientId,
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      usage: {
        operationDate: payload.operationDate,
        referenceItem: buildAccountBalanceReference(normalizedItems),
        amount: accountBalanceAmount,
        notes: null
      }
    })

    await tx.pendingPaymentCollection.create({
      data: {
        pendingPaymentId: sale.pendingPayment.id,
        saleId: sale.id,
        clientId: sale.pendingPayment.clientId,
        userId: payload.userId,
        amount: accountBalanceAmount,
        paymentMethod: 'ABONO',
        showInOfficialCash: false,
        operationDate: payload.operationDate
      }
    })
  }

  if (commercialAmount > 0) {
    await tx.pendingPaymentCollection.create({
      data: {
        pendingPaymentId: sale.pendingPayment.id,
        saleId: sale.id,
        clientId: sale.pendingPayment.clientId,
        userId: payload.userId,
        amount: commercialAmount,
        paymentMethod: normalizedPaymentMethod,
        showInOfficialCash: shouldShowInOfficialCash,
        operationDate: payload.operationDate
      }
    })

    await createStandaloneCashMovement(tx, {
      saleNumber: sale.saleNumber,
      clientName: getSaleDisplayName(sale, ''),
      userId: payload.userId,
      amount: commercialAmount,
      paymentMethod: normalizedPaymentMethod,
      showInOfficialCash: shouldShowInOfficialCash,
      date: payload.operationDate
    })
  }

  const remainingAmount = roundCurrency(Math.max(0, pendingOpenAmount - collectionAmount))

  await adjustClientPendingAmount(tx, {
    clientId: sale.pendingPayment.clientId,
    delta: -collectionAmount,
    enableAlertOnPositive: false
  })

  if (remainingAmount <= 0) {
    const settledPaymentMethod = commercialAmount > 0 ? normalizedPaymentMethod : 'ABONO'
    const finalPaymentMethod = commercialAmount > 0 ? normalizedPaymentMethod : 'ABONO'
    const finalShowInOfficialCash =
      finalPaymentMethod === 'CASH' ? shouldShowInOfficialCash : finalPaymentMethod !== 'ABONO'
    const bonoTemplates = await readBonoTemplates()
    const bonoMatches = getBonoMatchesForSale(normalizedItems, bonoTemplates)

    await tx.pendingPayment.update({
      where: { id: sale.pendingPayment.id },
      data: {
        amount: 0,
        status: 'SETTLED',
        settledAt: payload.operationDate,
        settledPaymentMethod
      }
    })

    const persistedSale = await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: 'COMPLETED',
        paymentMethod: finalPaymentMethod,
        showInOfficialCash: finalShowInOfficialCash
      },
      include: {
        client: true,
        appointment: {
          select: {
            guestName: true
          }
        }
      }
    })

    await createBonoPacksForSale(tx, {
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      clientId: sale.clientId,
      notes: sale.notes,
      matches: bonoMatches
    })

    await applySaleEffects(tx, {
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      clientId: sale.clientId,
      clientName: getSaleDisplayName(persistedSale, ''),
      userId: sale.userId,
      appointmentId: sale.appointmentId,
      total: Number(sale.total),
      paymentMethod: finalPaymentMethod,
      showInOfficialCash: finalShowInOfficialCash,
      items: normalizedItems,
      skipAutomaticCashMovement: true
    })
  } else {
    await tx.pendingPayment.update({
      where: { id: sale.pendingPayment.id },
      data: {
        amount: remainingAmount
      }
    })
  }

  return tx.sale.findUnique({
    where: { id: sale.id },
    include: saleInclude
  })
}

const rollbackSaleEffects = async (
  tx: TxClient,
  payload: {
    saleId: string
    saleNumber: string
    clientId: string | null
    appointmentId: string | null
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

  await deleteBonoPacksForSale(tx, payload.saleId)

  if (payload.appointmentId) {
    await tx.appointment.updateMany({
      where: {
        id: payload.appointmentId,
        status: 'COMPLETED'
      },
      data: {
        status: 'SCHEDULED'
      }
    })
  }
}

const toHttpError = (error: unknown) => {
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

const normalizeItemsFromSale = (items: { productId: string | null; serviceId: string | null; description: string; quantity: number; price: Prisma.Decimal }[]) =>
  items.map((item) => ({
    productId: item.productId,
    serviceId: item.serviceId,
    description: item.description,
    quantity: item.quantity,
    price: Number(item.price)
  }))

const getAppointmentSaleConflictMessage = (sale: { saleNumber?: string | null; status?: string | null }) => {
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

export const getSales = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, clientId, appointmentId, paymentMethod, status } = req.query

    const where: Prisma.SaleWhereInput = {}

    if (startDate && endDate) {
      where.date = buildInclusiveDateRange(startDate as string, endDate as string)
    }

    if (clientId) where.clientId = clientId as string
    if (appointmentId) where.appointmentId = appointmentId as string
    if (paymentMethod) where.paymentMethod = paymentMethod as string
    if (status) where.status = status as string

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
    const {
      clientId,
      appointmentId,
      items,
      discount,
      tax,
      paymentMethod,
      status,
      professional,
      notes,
      showInOfficialCash,
      accountBalanceUsage,
      combinedPayment: rawCombinedPayment
    } = req.body

    if (!req.user?.id) {
      throw new BusinessError(401, 'Unauthorized')
    }

    if (!PAYMENT_METHODS.includes(paymentMethod as string)) {
      throw new BusinessError(400, 'Invalid payment method')
    }

    const normalizedItems = ensureValidSaleItems(items)
    const discountValue = Number(discount) || 0
    const taxValue = Number(tax) || 0
    const { subtotal, total } = calculateTotals(normalizedItems, discountValue, taxValue)
    const bonoTemplates = await readBonoTemplates()
    const bonoMatches = getBonoMatchesForSale(normalizedItems, bonoTemplates)
    const combinedPayment = normalizeCombinedPayment(rawCombinedPayment, total)

    if (combinedPayment && accountBalanceUsage) {
      throw new BusinessError(400, 'Account balance usage cannot be combined with combined payment payload')
    }

    let parsedAccountBalanceUsage: AccountBalanceUsageInput | null = accountBalanceUsage
      ? {
          operationDate: new Date(accountBalanceUsage.operationDate),
          referenceItem:
            typeof accountBalanceUsage.referenceItem === 'string'
              ? accountBalanceUsage.referenceItem.trim()
              : '',
          amount: roundCurrency(Number(accountBalanceUsage.amount)),
          notes: accountBalanceUsage.notes || null
        }
      : null

    if (combinedPayment && combinedPayment.accountBalanceAmount > 0) {
      parsedAccountBalanceUsage = {
        operationDate: new Date(),
        referenceItem: buildAccountBalanceReference(normalizedItems),
        amount: combinedPayment.accountBalanceAmount,
        notes: null
      }
    }

    if (isAccountBalancePaymentMethod(paymentMethod as string) && !parsedAccountBalanceUsage && !combinedPayment) {
      parsedAccountBalanceUsage = {
        operationDate: new Date(),
        referenceItem: buildAccountBalanceReference(normalizedItems),
        amount: roundCurrency(total),
        notes: null
      }
    }

    if (
      parsedAccountBalanceUsage &&
      Number.isNaN(parsedAccountBalanceUsage.operationDate.getTime())
    ) {
      throw new BusinessError(400, 'Account balance usage operation date is invalid')
    }

    if (parsedAccountBalanceUsage && !parsedAccountBalanceUsage.referenceItem) {
      throw new BusinessError(400, 'Account balance usage reference item is required')
    }

    if (
      parsedAccountBalanceUsage &&
      (!Number.isFinite(parsedAccountBalanceUsage.amount) || parsedAccountBalanceUsage.amount <= 0)
    ) {
      throw new BusinessError(400, 'Account balance usage amount must be greater than zero')
    }

    if (parsedAccountBalanceUsage && parsedAccountBalanceUsage.amount > total) {
      throw new BusinessError(400, 'Account balance usage amount cannot be greater than sale total')
    }

    let nextStatus = status || 'COMPLETED'
    if (combinedPayment) {
      nextStatus = combinedPayment.pendingAmount > 0 ? 'PENDING' : 'COMPLETED'
    }

    if (!['PENDING', 'COMPLETED'].includes(nextStatus)) {
      throw new BusinessError(400, 'Invalid sale status')
    }

    if (nextStatus !== 'COMPLETED' && parsedAccountBalanceUsage && !combinedPayment) {
      throw new BusinessError(400, 'Account balance usage requires a completed sale')
    }

    const salePaymentMethod = combinedPayment
      ? combinedPayment.pendingAmount > 0
        ? combinedPayment.primaryMethod
        : 'OTHER'
      : String(paymentMethod || '').toUpperCase()

    const paymentBreakdown = combinedPayment && combinedPayment.pendingAmount <= 0
      ? serializePaymentBreakdown(combinedPayment.collectedEntries)
      : null
    const officialCashTotal = combinedPayment
      ? roundCurrency(combinedPayment.cashMovement?.amount || 0)
      : parsedAccountBalanceUsage
        ? roundCurrency(total - parsedAccountBalanceUsage.amount)
        : roundCurrency(total)

    if (
      parsedAccountBalanceUsage &&
      isAccountBalancePaymentMethod(paymentMethod as string) &&
      officialCashTotal > 0 &&
      !combinedPayment
      ) {
        throw new BusinessError(400, 'Payment method ABONO requires full account balance coverage')
      }

      let shouldShowInOfficialCash = combinedPayment
        ? combinedPayment.officialCommercialAmount > 0
        : paymentMethod === 'CASH'
          ? showInOfficialCash !== false
          : true
    if (
      !combinedPayment &&
      parsedAccountBalanceUsage &&
      (isAccountBalancePaymentMethod(paymentMethod as string) || officialCashTotal <= 0)
    ) {
      shouldShowInOfficialCash = false
    }

    const sale = await prisma.$transaction(async (tx) => {
      let resolvedClientId = clientId || null
      let appointmentClientName = ''

      if (appointmentId) {
        const appointment = await tx.appointment.findUnique({
          where: { id: appointmentId },
          select: {
            id: true,
            clientId: true,
            guestName: true,
            client: {
              select: {
                firstName: true,
                lastName: true
              }
            },
            sale: {
              select: {
                id: true,
                saleNumber: true,
                status: true
              }
            }
          }
        })

        if (!appointment) {
          throw new BusinessError(404, 'Appointment not found')
        }

        if (appointment.sale) {
          throw new BusinessError(
            appointment.sale.status === 'COMPLETED' ? 400 : 409,
            getAppointmentSaleConflictMessage(appointment.sale)
          )
        }

        if (resolvedClientId && resolvedClientId !== appointment.clientId) {
          throw new BusinessError(400, 'Appointment and sale client must match')
        }

        resolvedClientId = appointment.clientId
        appointmentClientName = getAppointmentDisplayName(appointment, 'Cliente general')
      }

      if (parsedAccountBalanceUsage && !resolvedClientId) {
        throw new BusinessError(400, 'Account balance usage requires a client')
      }

      if (bonoMatches.length > 0 && !resolvedClientId) {
        throw new BusinessError(400, 'Sales with bonos require a client')
      }

      if (nextStatus === 'PENDING' && !resolvedClientId) {
        throw new BusinessError(400, 'Pending sales require a client')
      }

      const saleNumber = await buildSaleNumber(tx)

      const createdSale = await tx.sale.create({
        data: {
          clientId: resolvedClientId,
          appointmentId: appointmentId || null,
          userId: req.user!.id,
          professional: professional || 'LUCY',
          saleNumber,
          subtotal,
          discount: discountValue,
          tax: taxValue,
          total,
          paymentMethod: salePaymentMethod,
          paymentBreakdown,
          showInOfficialCash: shouldShowInOfficialCash,
          status: nextStatus,
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

      if (nextStatus === 'COMPLETED') {
        await createBonoPacksForSale(tx, {
          saleId: createdSale.id,
          saleNumber,
          clientId: createdSale.clientId,
          notes: notes || null,
          matches: bonoMatches
        })
      }

      const clientName = createdSale.client
        ? `${createdSale.client.firstName} ${createdSale.client.lastName}`.trim()
        : appointmentClientName

      if (nextStatus === 'COMPLETED') {
        await applySaleEffects(tx, {
          saleId: createdSale.id,
          saleNumber,
          clientId: createdSale.clientId,
          clientName,
          userId: req.user!.id,
          appointmentId: createdSale.appointmentId,
            total,
            cashMovementTotal: officialCashTotal,
            paymentMethod: salePaymentMethod,
            cashMovementPaymentMethod: combinedPayment?.cashMovement?.paymentMethod,
            cashMovementShowInOfficialCash: combinedPayment?.cashMovement?.showInOfficialCash,
            showInOfficialCash: createdSale.showInOfficialCash,
            items: normalizedItems
          })

        if (parsedAccountBalanceUsage && createdSale.clientId) {
          await applyAccountBalanceUsage(tx, {
            clientId: createdSale.clientId,
            saleId: createdSale.id,
            saleNumber,
            usage: parsedAccountBalanceUsage
          })
        }
      } else if (nextStatus === 'PENDING') {
        await createPendingPayment(tx, {
          saleId: createdSale.id,
          clientId: createdSale.clientId,
          amount: total,
          createdAt: createdSale.date
        })

        if (combinedPayment) {
          const collectedEntry = combinedPayment.collectedEntries[0]
          if (collectedEntry) {
            await collectPendingPayment(tx, {
              saleId: createdSale.id,
              userId: req.user!.id,
              amount: collectedEntry.amount,
              paymentMethod: collectedEntry.paymentMethod,
              operationDate: createdSale.date,
              showInOfficialCash: collectedEntry.showInOfficialCash !== false,
              accountBalanceUsageAmount: parsedAccountBalanceUsage?.amount
            })
          }
        }
      }

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
    const { status, paymentMethod, notes, settledAt } = req.body

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

    if (status && !SALE_STATUSES.includes(status as string)) {
      throw new BusinessError(400, 'Invalid sale status')
    }

    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod as string)) {
      throw new BusinessError(400, 'Invalid payment method')
    }

    const parsedSettledAt = parseOptionalDate(settledAt)
    if (settledAt !== undefined && !parsedSettledAt) {
      throw new BusinessError(400, 'Invalid settlement date')
    }

    const bonoTemplates = await readBonoTemplates()

    const updatedSale = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          client: true,
          appointment: {
            select: {
              guestName: true
            }
          },
          items: true,
          pendingPayment: {
            select: {
              amount: true,
              status: true
            }
          }
        }
      })

      if (!sale) {
        throw new BusinessError(404, 'Sale not found')
      }

      const nextStatus = (status || sale.status) as string
      let nextPaymentMethod = (paymentMethod || sale.paymentMethod) as string
      const normalizedItems = normalizeItemsFromSale(sale.items)
      const bonoMatches = getBonoMatchesForSale(
        normalizedItems.map((item) => ({
          productId: item.productId,
          serviceId: item.serviceId,
          description: item.description,
          quantity: item.quantity,
          price: item.price
        })),
        bonoTemplates
      )

      if (sale.status === 'PENDING' && nextStatus === 'COMPLETED') {
        if (
          sale.pendingPayment &&
          sale.pendingPayment.status === 'OPEN' &&
          Number(sale.pendingPayment.amount || 0) < Number(sale.total || 0)
        ) {
          throw new BusinessError(
            400,
            'Use the pending collection flow to complete sales with partial pending collections'
          )
        }

        const requestedPaymentMethod = String(paymentMethod || sale.paymentMethod || '').toUpperCase()
        nextPaymentMethod = SETTLED_PENDING_PAYMENT_METHODS.includes(requestedPaymentMethod)
          ? requestedPaymentMethod
          : 'CASH'
      }

      if (nextStatus === 'PENDING') {
        if (!sale.clientId) {
          throw new BusinessError(400, 'Pending sales require a client')
        }

        const requestedPaymentMethod = String(paymentMethod || sale.paymentMethod || '').toUpperCase()
        nextPaymentMethod = SETTLED_PENDING_PAYMENT_METHODS.includes(requestedPaymentMethod)
          ? requestedPaymentMethod
          : 'CASH'
      }

      const nextShowInOfficialCash =
        nextStatus === 'PENDING'
          ? false
          : sale.status === 'PENDING' && nextStatus === 'COMPLETED'
            ? true
            : sale.showInOfficialCash

      if (sale.status === 'COMPLETED' && nextStatus !== 'COMPLETED') {
        await rollbackSaleEffects(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          appointmentId: sale.appointmentId,
          total: Number(sale.total),
          items: normalizedItems
        })
      }

      const persisted = await tx.sale.update({
        where: { id },
        data: {
          status: nextStatus,
          paymentMethod: nextPaymentMethod,
          notes: notes ?? sale.notes,
          showInOfficialCash: nextShowInOfficialCash
        },
        include: {
          client: true,
          appointment: {
            select: {
              guestName: true
            }
          }
        }
      })

      if (sale.status !== 'COMPLETED' && nextStatus === 'COMPLETED') {
        if (bonoMatches.length > 0 && !sale.clientId) {
          throw new BusinessError(400, 'Sales with bonos require a client')
        }

        await createBonoPacksForSale(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          notes: notes ?? sale.notes,
          matches: bonoMatches
        })

        await applySaleEffects(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientId: sale.clientId,
          clientName: getSaleDisplayName(persisted, ''),
          userId: sale.userId,
          appointmentId: sale.appointmentId,
          total: Number(sale.total),
          paymentMethod: nextPaymentMethod,
          showInOfficialCash: nextShowInOfficialCash,
          items: normalizedItems
        })
      } else if (
        sale.status === 'COMPLETED' &&
        nextStatus === 'COMPLETED' &&
        nextPaymentMethod !== sale.paymentMethod
      ) {
        await syncAutomaticCashMovement(tx, {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          clientName: getSaleDisplayName(persisted, ''),
          userId: sale.userId,
          total: Number(sale.total),
          paymentMethod: nextPaymentMethod,
          showInOfficialCash: nextShowInOfficialCash
        })
      }

      if (sale.status !== 'PENDING' && nextStatus === 'PENDING') {
        await reopenPendingPayment(tx, {
          saleId: sale.id,
          clientId: sale.clientId,
          amount: Number(sale.total),
          createdAt: new Date(sale.date)
        })
      } else if (sale.status === 'PENDING' && nextStatus === 'COMPLETED') {
        await resolvePendingPayment(tx, {
          saleId: sale.id,
          resolutionStatus: 'SETTLED',
          settledAt: parsedSettledAt || new Date(),
          settledPaymentMethod: nextPaymentMethod
        })
      } else if (sale.status === 'PENDING' && nextStatus !== 'PENDING') {
        await resolvePendingPayment(tx, {
          saleId: sale.id,
          resolutionStatus: 'CANCELLED'
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

export const collectPendingSale = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { amount, paymentMethod, operationDate, showInOfficialCash, accountBalanceUsageAmount } = req.body

    if (!req.user?.id) {
      throw new BusinessError(401, 'Unauthorized')
    }

    if (!PAYMENT_METHODS.includes(String(paymentMethod || '').toUpperCase())) {
      throw new BusinessError(400, 'Invalid payment method')
    }

    const parsedOperationDate = parseOptionalDate(operationDate)
    if (!parsedOperationDate) {
      throw new BusinessError(400, 'Invalid pending collection date')
    }

    const updatedSale = await prisma.$transaction((tx) =>
      collectPendingPayment(tx, {
        saleId: id,
        userId: req.user!.id,
        amount: roundCurrency(Number(amount)),
        paymentMethod: String(paymentMethod || '').toUpperCase(),
        operationDate: parsedOperationDate,
        showInOfficialCash: showInOfficialCash !== false,
        accountBalanceUsageAmount:
          accountBalanceUsageAmount === undefined ? undefined : roundCurrency(Number(accountBalanceUsageAmount))
      })
    )

    res.json(updatedSale)
  } catch (error) {
    const { statusCode, message } = toHttpError(error)
    console.error('Collect pending sale error:', error)
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
          appointmentId: sale.appointmentId,
          total: Number(sale.total),
          items: normalizeItemsFromSale(sale.items)
        })
      } else if (sale.status === 'PENDING') {
        await resolvePendingPayment(tx, {
          saleId: sale.id,
          resolutionStatus: 'CANCELLED'
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
