import { describe, expect, it } from 'vitest'
import { computeCashCountTotals } from '../../../src/backend/utils/cashCount'

describe('computeCashCountTotals', () => {
  it('returns zero totals for an empty recount', () => {
    const result = computeCashCountTotals({}, 0)
    expect(result.countedTotal).toBe(0)
    expect(result.billTotal).toBe(0)
    expect(result.coinTotal).toBe(0)
    expect(result.difference).toBe(0)
  })

  it('computes bill and coin subtotals without floating point drift', () => {
    const result = computeCashCountTotals(
      { 'bill-50': 2, 'bill-10': 3, 'coin-50c': 4, 'coin-1c': 7 },
      0
    )
    expect(result.billTotal).toBe(130)
    expect(result.coinTotal).toBe(2.07)
    expect(result.countedTotal).toBe(132.07)
    expect(result.difference).toBe(132.07)
  })

  it('computes a negative difference when the count is short', () => {
    const result = computeCashCountTotals({ 'bill-20': 5 }, 150)
    expect(result.countedTotal).toBe(100)
    expect(result.difference).toBe(-50)
  })

  it('treats cuadre as exact when counted matches expected', () => {
    const result = computeCashCountTotals({ 'bill-100': 1, 'bill-50': 1 }, 150)
    expect(result.difference).toBe(0)
  })

  it('coerces string and invalid quantities', () => {
    const result = computeCashCountTotals(
      { 'bill-500': '2' as unknown as number, 'bill-200': 'abc' as unknown as number, 'coin-1e': -5 as number },
      0
    )
    expect(result.normalizedDenominations['bill-500']).toBe(2)
    expect(result.normalizedDenominations['bill-200']).toBe(0)
    expect(result.normalizedDenominations['coin-1e']).toBe(0)
    expect(result.countedTotal).toBe(1000)
  })

  it('ignores unknown denomination keys', () => {
    const result = computeCashCountTotals({ 'bill-9999': 10, 'bill-10': 1 } as Record<string, number>, 0)
    expect(result.countedTotal).toBe(10)
  })
})
