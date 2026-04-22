import { describe, expect, it } from 'vitest'
import {
  buildEmptyCashCountInputs,
  calculateCashCountSummary
} from '../../../src/renderer/utils/cashCount'

describe('cashCount', () => {
  it('builds an empty input map for all denominations', () => {
    const inputs = buildEmptyCashCountInputs()

    expect(inputs['bill-500']).toBe('')
    expect(inputs['coin-1c']).toBe('')
    expect(Object.keys(inputs)).toHaveLength(15)
  })

  it('calculates bills, coins and total counted cash', () => {
    const summary = calculateCashCountSummary({
      'bill-20': '1',
      'bill-10': '2',
      'bill-5': '3',
      'coin-2e': '3',
      'coin-1e': '3',
      'coin-50c': '6',
      'coin-20c': '6',
      'coin-10c': '7',
      'coin-5c': '1',
      'coin-2c': '5',
      'coin-1c': '4'
    })

    expect(summary.billTotal).toBe(55)
    expect(summary.coinTotal).toBe(14.09)
    expect(summary.total).toBe(69.09)
    expect(summary.lineTotals['coin-50c']).toBe(3)
  })

  it('reports the difference against the expected balance', () => {
    const summary = calculateCashCountSummary(
      {
        'bill-20': '1',
        'coin-2e': '2x',
        'coin-1c': undefined
      },
      30
    )

    expect(summary.total).toBe(24)
    expect(summary.difference).toBe(-6)
    expect(summary.isBalanced).toBe(false)
  })
})
