export type CashCountFamily = 'bill' | 'coin'

export type CashCountDenomination = {
  key: string
  family: CashCountFamily
  label: string
  valueCents: number
}

export const CASH_COUNT_DENOMINATIONS: CashCountDenomination[] = [
  { key: 'bill-500', family: 'bill', label: '500 €', valueCents: 50000 },
  { key: 'bill-200', family: 'bill', label: '200 €', valueCents: 20000 },
  { key: 'bill-100', family: 'bill', label: '100 €', valueCents: 10000 },
  { key: 'bill-50', family: 'bill', label: '50 €', valueCents: 5000 },
  { key: 'bill-20', family: 'bill', label: '20 €', valueCents: 2000 },
  { key: 'bill-10', family: 'bill', label: '10 €', valueCents: 1000 },
  { key: 'bill-5', family: 'bill', label: '5 €', valueCents: 500 },
  { key: 'coin-2e', family: 'coin', label: '2 €', valueCents: 200 },
  { key: 'coin-1e', family: 'coin', label: '1 €', valueCents: 100 },
  { key: 'coin-50c', family: 'coin', label: '50 c', valueCents: 50 },
  { key: 'coin-20c', family: 'coin', label: '20 c', valueCents: 20 },
  { key: 'coin-10c', family: 'coin', label: '10 c', valueCents: 10 },
  { key: 'coin-5c', family: 'coin', label: '5 c', valueCents: 5 },
  { key: 'coin-2c', family: 'coin', label: '2 c', valueCents: 2 },
  { key: 'coin-1c', family: 'coin', label: '1 c', valueCents: 1 }
]

export const DENOMINATION_KEYS = new Set(CASH_COUNT_DENOMINATIONS.map((d) => d.key))

const normalizeQuantity = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return 0
  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export type CashCountServerSummary = {
  billTotal: number
  coinTotal: number
  countedTotal: number
  difference: number
  normalizedDenominations: Record<string, number>
}

export const computeCashCountTotals = (
  denominations: Record<string, unknown>,
  expectedTotal: number
): CashCountServerSummary => {
  let billCents = 0
  let coinCents = 0
  const normalizedDenominations: Record<string, number> = {}

  for (const denomination of CASH_COUNT_DENOMINATIONS) {
    const quantity = normalizeQuantity(denominations?.[denomination.key])
    normalizedDenominations[denomination.key] = quantity
    const lineCents = denomination.valueCents * quantity
    if (denomination.family === 'bill') {
      billCents += lineCents
    } else {
      coinCents += lineCents
    }
  }

  const expectedCents = Math.round(Number(expectedTotal || 0) * 100)
  const totalCents = billCents + coinCents
  const diffCents = totalCents - expectedCents

  return {
    billTotal: billCents / 100,
    coinTotal: coinCents / 100,
    countedTotal: totalCents / 100,
    difference: diffCents / 100,
    normalizedDenominations
  }
}
