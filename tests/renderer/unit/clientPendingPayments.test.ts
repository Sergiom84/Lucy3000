import { describe, expect, it } from 'vitest'
import { buildClientPendingSummary } from '../../../src/renderer/utils/clientPendingPayments'

describe('clientPendingPayments', () => {
  it('adds a manual pending row when the client pending amount exceeds linked open pending sales', () => {
    const summary = buildClientPendingSummary({
      id: 'client-1',
      createdAt: '2026-01-10T10:00:00.000Z',
      updatedAt: '2026-04-19T16:00:00.000Z',
      pendingAmount: 200,
      pendingPayments: []
    })

    expect(summary.manualAmount).toBe(200)
    expect(summary.saleOpenAmount).toBe(0)
    expect(summary.openAmount).toBe(200)
    expect(summary.rows).toEqual([
      expect.objectContaining({
        id: 'manual-pending-client-1',
        amount: 200,
        status: 'OPEN',
        source: 'MANUAL',
        label: 'Pendiente manual'
      })
    ])
  })

  it('does not duplicate pending amount when open pending sales already match the client balance', () => {
    const summary = buildClientPendingSummary({
      id: 'client-2',
      pendingAmount: 200,
      pendingPayments: [
        {
          id: 'pending-1',
          amount: 200,
          status: 'OPEN',
          createdAt: '2026-04-19T09:00:00.000Z',
          sale: {
            id: 'sale-1',
            saleNumber: 'V-001',
            date: '2026-04-19T09:00:00.000Z',
            total: 200,
            status: 'PENDING',
            paymentMethod: 'CASH',
            notes: null
          }
        }
      ]
    })

    expect(summary.manualAmount).toBe(0)
    expect(summary.saleOpenAmount).toBe(200)
    expect(summary.openAmount).toBe(200)
    expect(summary.rows).toEqual([
      expect.objectContaining({
        id: 'pending-1',
        amount: 200,
        remainingAmount: 200,
        status: 'OPEN',
        source: 'SALE'
      })
    ])
  })

  it('keeps settled pending sales out of the current open total and preserves manual remainder', () => {
    const summary = buildClientPendingSummary({
      id: 'client-3',
      createdAt: '2026-01-10T10:00:00.000Z',
      updatedAt: '2026-04-19T16:00:00.000Z',
      pendingAmount: 150,
      pendingPayments: [
        {
          id: 'pending-2',
          amount: 100,
          status: 'SETTLED',
          createdAt: '2026-04-10T09:00:00.000Z',
          settledAt: '2026-04-11T09:00:00.000Z',
          settledPaymentMethod: 'CARD',
          sale: {
            id: 'sale-2',
            saleNumber: 'V-002',
            date: '2026-04-10T09:00:00.000Z',
            total: 100,
            status: 'COMPLETED',
            paymentMethod: 'CARD',
            notes: null
          }
        }
      ]
    })

    expect(summary.manualAmount).toBe(150)
    expect(summary.saleOpenAmount).toBe(0)
    expect(summary.openAmount).toBe(150)
    expect(summary.rows[0]).toEqual(
      expect.objectContaining({
        source: 'MANUAL',
        amount: 150
      })
    )
    expect(summary.rows[1]).toEqual(
      expect.objectContaining({
        source: 'SALE',
        status: 'SETTLED',
        amount: 100,
        remainingAmount: 100
      })
    )
  })

  it('preserves partial pending collection history and computes the open amount from the remaining balance', () => {
    const summary = buildClientPendingSummary({
      id: 'client-4',
      pendingAmount: 120,
      pendingPayments: [
        {
          id: 'pending-3',
          amount: 120,
          status: 'OPEN',
          createdAt: '2026-04-19T09:00:00.000Z',
          collections: [
            {
              id: 'collection-1',
              amount: 50,
              paymentMethod: 'CARD',
              showInOfficialCash: true,
              operationDate: '2026-04-19T10:00:00.000Z',
              createdAt: '2026-04-19T10:00:00.000Z'
            },
            {
              id: 'collection-2',
              amount: 30,
              paymentMethod: 'CASH',
              showInOfficialCash: false,
              operationDate: '2026-04-19T11:00:00.000Z',
              createdAt: '2026-04-19T11:00:00.000Z'
            }
          ],
          sale: {
            id: 'sale-3',
            saleNumber: 'V-003',
            date: '2026-04-19T09:00:00.000Z',
            total: 200,
            status: 'PENDING',
            paymentMethod: 'CASH',
            notes: null
          }
        }
      ]
    })

    expect(summary.manualAmount).toBe(0)
    expect(summary.saleOpenAmount).toBe(120)
    expect(summary.openAmount).toBe(120)
    expect(summary.rows[0]).toEqual(
      expect.objectContaining({
        id: 'pending-3',
        amount: 120,
        remainingAmount: 120,
        collections: [
          expect.objectContaining({
            id: 'collection-1',
            amount: 50,
            paymentMethod: 'CARD'
          }),
          expect.objectContaining({
            id: 'collection-2',
            amount: 30,
            paymentMethod: 'CASH',
            showInOfficialCash: false
          })
        ]
      })
    )
  })
})
