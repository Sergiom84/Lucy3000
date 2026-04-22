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

export const CASH_COUNT_BILL_DENOMINATIONS = CASH_COUNT_DENOMINATIONS.filter(
  (denomination) => denomination.family === 'bill'
)

export const CASH_COUNT_COIN_DENOMINATIONS = CASH_COUNT_DENOMINATIONS.filter(
  (denomination) => denomination.family === 'coin'
)

export type CashCountQuantities = Record<string, unknown>

export type CashCountSummary = {
  lineTotals: Record<string, number>
  billTotal: number
  coinTotal: number
  total: number
  expectedTotal: number
  difference: number
  isBalanced: boolean
}

const normalizeQuantity = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }

  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return 0

  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

const centsToAmount = (valueCents: number) => valueCents / 100

export const buildEmptyCashCountInputs = () =>
  Object.fromEntries(CASH_COUNT_DENOMINATIONS.map((denomination) => [denomination.key, ''])) as Record<string, string>

export const getCashCountPieceCounts = (quantities: CashCountQuantities) => {
  let billPieces = 0
  let coinPieces = 0
  for (const denomination of CASH_COUNT_DENOMINATIONS) {
    const pieces = normalizeQuantity(quantities?.[denomination.key])
    if (denomination.family === 'bill') {
      billPieces += pieces
    } else {
      coinPieces += pieces
    }
  }
  return { billPieces, coinPieces, totalPieces: billPieces + coinPieces }
}

export const calculateCashCountSummary = (
  quantities: CashCountQuantities,
  expectedTotal = 0
): CashCountSummary => {
  const lineTotals: Record<string, number> = {}
  let billCents = 0
  let coinCents = 0

  for (const denomination of CASH_COUNT_DENOMINATIONS) {
    const quantity = normalizeQuantity(quantities?.[denomination.key])
    const lineTotalCents = denomination.valueCents * quantity
    const lineTotal = centsToAmount(lineTotalCents)

    lineTotals[denomination.key] = lineTotal

    if (denomination.family === 'bill') {
      billCents += lineTotalCents
    } else {
      coinCents += lineTotalCents
    }
  }

  const expectedCents = Math.round(Number(expectedTotal || 0) * 100)
  const totalCents = billCents + coinCents
  const differenceCents = totalCents - expectedCents

  return {
    lineTotals,
    billTotal: centsToAmount(billCents),
    coinTotal: centsToAmount(coinCents),
    total: centsToAmount(totalCents),
    expectedTotal: centsToAmount(expectedCents),
    difference: centsToAmount(differenceCents),
    isBalanced: differenceCents === 0
  }
}
