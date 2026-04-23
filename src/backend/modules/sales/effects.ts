import { adjustClientPendingAmount } from '../../utils/clientDebt'
import { getSaleDisplayName } from '../../utils/customer-display'
import { readBonoTemplates } from '../bonos/templateCatalog'
import {
  buildAccountBalanceReference,
  type AccountBalanceUsageInput,
  BusinessError,
  type SaleBonoMatch,
  type SaleItemInput,
  PENDING_PAYMENT_STATUSES,
  roundCurrency,
  saleInclude,
  type TxClient,
  normalizeItemsFromSale
} from './shared'
import {
  createStandaloneCashMovement,
  syncAutomaticCashMovement
} from './cash'
import { getBonoMatchesForSale } from './validation'

const buildBonoPackNotes = (saleId: string, saleNumber: string, notes?: string | null) => {
  const marker = `BONO_SALE:${saleId}`
  const parts = [marker, `Venta ${saleNumber}`, notes?.trim()].filter(Boolean)
  return parts.join(' | ')
}

export const createBonoPacksForSale = async (
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

export const deleteBonoPacksForSale = async (tx: TxClient, saleId: string) => {
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

export const applySaleEffects = async (
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

export const applyAccountBalanceUsage = async (
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

export const createPendingPayment = async (
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

export const resolvePendingPayment = async (
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

export const reopenPendingPayment = async (
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

export const collectPendingPayment = async (
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
    const bonoTemplates = await readBonoTemplates({ onlyActive: true })
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

export const rollbackSaleEffects = async (
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
