import { describe, expect, it } from 'vitest'
import { buildSaleTicketPayload, salePaymentMethodLabel } from '../../../src/renderer/utils/tickets'

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

  it('omits private cash legs from the printed ticket payment method', () => {
    expect(
      buildSaleTicketPayload({
        saleNumber: 'V-000100',
        date: '2026-04-19T10:30:00.000Z',
        subtotal: 200,
        discount: 0,
        total: 200,
        paymentMethod: 'OTHER',
        paymentBreakdown:
          '[{"paymentMethod":"CASH","amount":80,"showInOfficialCash":false},{"paymentMethod":"CARD","amount":120}]',
        items: []
      }).paymentMethod
    ).toBe('Tarjeta')
  })
})
