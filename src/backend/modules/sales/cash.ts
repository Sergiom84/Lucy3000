import { withPostgresSequenceLock } from '../../utils/sequence-lock'
import { type TxClient, roundCurrency } from './shared'

export const buildSaleNumber = async (tx: TxClient): Promise<string> => {
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

export const getOpenCashRegister = async (tx: TxClient) =>
  tx.cashRegister.findFirst({
    where: { status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
    select: { id: true }
  })

export const shouldRecordOfficialCashFlow = (paymentMethod: string, showInOfficialCash = true) => {
  if (String(paymentMethod || '').toUpperCase() !== 'CASH') {
    return true
  }

  return showInOfficialCash !== false
}

export const syncAutomaticCashMovement = async (
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

export const createStandaloneCashMovement = async (
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
