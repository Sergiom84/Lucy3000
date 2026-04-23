import { describe, expect, it } from 'vitest'
import {
  mapSaleClient,
  parsePositiveNumericInput,
  resolveSalesView,
  roundCurrency
} from '../../../src/renderer/features/sales/salesHelpers'

describe('salesHelpers', () => {
  it('resolves the requested sales view from query string values', () => {
    expect(resolveSalesView('history')).toBe('history')
    expect(resolveSalesView('account-balance')).toBe('account-balance')
    expect(resolveSalesView(null)).toBe('pos')
  })

  it('rounds currency with stable two-decimal precision', () => {
    expect(roundCurrency(10.005)).toBe(10.01)
  })

  it('parses positive numeric input and clamps invalid values', () => {
    expect(parsePositiveNumericInput('12,5')).toBe(12.5)
    expect(parsePositiveNumericInput('-4')).toBe(0)
    expect(parsePositiveNumericInput('abc')).toBe(0)
  })

  it('maps a sale client payload to the renderer shape', () => {
    expect(
      mapSaleClient({
        id: 'client-1',
        firstName: 'Ana',
        lastName: 'Lopez',
        mobilePhone: '600123123',
        loyaltyPoints: '7',
        accountBalance: '42.5'
      })
    ).toEqual({
      id: 'client-1',
      firstName: 'Ana',
      lastName: 'Lopez',
      phone: '600123123',
      email: undefined,
      loyaltyPoints: 7,
      accountBalance: 42.5
    })
  })
})
