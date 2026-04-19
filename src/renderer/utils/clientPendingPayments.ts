export type PendingPaymentRow = {
  id: string
  amount: number
  status: 'OPEN' | 'SETTLED' | 'CANCELLED'
  createdAt: string
  settledAt?: string | null
  settledPaymentMethod?: string | null
  sale?: {
    id: string
    saleNumber: string
    date: string
    total: number
    status: string
    paymentMethod: string
    notes?: string | null
  } | null
  source: 'SALE' | 'MANUAL'
  label?: string
  note?: string | null
}

type ClientPendingShape = {
  id?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  pendingAmount?: number | string | null
  pendingPayments?: any[]
}

type ClientPendingSummary = {
  rows: PendingPaymentRow[]
  openAmount: number
  manualAmount: number
  saleOpenAmount: number
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const parseAmount = (value: unknown) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

export const buildClientPendingSummary = (client: ClientPendingShape | null | undefined): ClientPendingSummary => {
  const saleRows: PendingPaymentRow[] = Array.isArray(client?.pendingPayments)
    ? client.pendingPayments.map((pendingPayment: any) => ({
        id: pendingPayment.id,
        amount: parseAmount(pendingPayment.amount || pendingPayment.sale?.total),
        status: String(pendingPayment.status || 'OPEN').toUpperCase() as PendingPaymentRow['status'],
        createdAt: String(pendingPayment.createdAt || client?.updatedAt || client?.createdAt || ''),
        settledAt: pendingPayment.settledAt || null,
        settledPaymentMethod: pendingPayment.settledPaymentMethod || null,
        sale: pendingPayment.sale
          ? {
              id: pendingPayment.sale.id,
              saleNumber: pendingPayment.sale.saleNumber,
              date: pendingPayment.sale.date,
              total: parseAmount(pendingPayment.sale.total),
              status: pendingPayment.sale.status,
              paymentMethod: pendingPayment.sale.paymentMethod,
              notes: pendingPayment.sale.notes || null
            }
          : null,
        source: 'SALE'
      }))
    : []

  const openSaleAmount = roundCurrency(
    saleRows.reduce((sum, row) => sum + (row.status === 'OPEN' ? row.amount : 0), 0)
  )
  const currentPendingAmount = roundCurrency(Math.max(0, parseAmount(client?.pendingAmount)))
  const manualAmount = roundCurrency(Math.max(0, currentPendingAmount - openSaleAmount))

  const rows =
    manualAmount > 0
      ? [
          {
            id: `manual-pending-${client?.id || 'unknown'}`,
            amount: manualAmount,
            status: 'OPEN' as const,
            createdAt: String(client?.updatedAt || client?.createdAt || ''),
            settledAt: null,
            settledPaymentMethod: null,
            sale: null,
            source: 'MANUAL' as const,
            label: 'Pendiente manual',
            note: null
          },
          ...saleRows
        ]
      : saleRows

  const openAmount = roundCurrency(rows.reduce((sum, row) => sum + (row.status === 'OPEN' ? row.amount : 0), 0))

  return {
    rows,
    openAmount,
    manualAmount,
    saleOpenAmount: openSaleAmount
  }
}
