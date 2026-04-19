import { describe, expect, it } from 'vitest'
import { salePaymentMethodLabel } from '../../../src/renderer/utils/tickets'

describe('tickets salePaymentMethodLabel', () => {
  it('renders stored combined payment breakdown labels', () => {
    expect(
      salePaymentMethodLabel({
        status: 'COMPLETED',
        paymentMethod: 'OTHER',
        paymentBreakdown:
          '[{"paymentMethod":"CASH","amount":80},{"paymentMethod":"CARD","amount":120}]'
      })
    ).toBe('Efectivo + Tarjeta')
  })

  it('renders pending sales with collected breakdown and pending remainder', () => {
    expect(
      salePaymentMethodLabel({
        status: 'PENDING',
        paymentMethod: 'CASH',
        pendingPayment: {
          collections: [
            {
              amount: 100,
              paymentMethod: 'CASH'
            }
          ]
        }
      })
    ).toBe('Efectivo + Pendiente')
  })
})
