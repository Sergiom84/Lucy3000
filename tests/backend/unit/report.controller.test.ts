import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSalesReport } from '../../../src/backend/controllers/report.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('report.controller sales report', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('separates collected revenue from work performed and normalizes ABONO', async () => {
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        saleNumber: 'V-000101',
        date: new Date('2026-03-31T10:00:00.000Z'),
        total: 80,
        paymentMethod: 'CARD',
        clientId: 'client-1',
        client: { id: 'client-1', firstName: 'Ana', lastName: 'Lopez' },
        user: { name: 'Lucy' },
        accountBalanceMovements: [{ type: 'CONSUMPTION', amount: 30 }],
        items: [
          {
            id: 'item-1',
            description: 'Limpieza facial',
            quantity: 1,
            subtotal: 80,
            productId: null,
            serviceId: 'service-1',
            product: null,
            service: { id: 'service-1', name: 'Limpieza facial' }
          }
        ]
      },
      {
        id: 'sale-2',
        saleNumber: 'V-000102',
        date: new Date('2026-03-31T12:00:00.000Z'),
        total: 48,
        paymentMethod: 'OTHER',
        clientId: 'client-2',
        client: { id: 'client-2', firstName: 'Sergio', lastName: 'Hernandez' },
        user: { name: 'Lucy' },
        accountBalanceMovements: [{ type: 'CONSUMPTION', amount: 48 }],
        items: [
          {
            id: 'item-2',
            description: 'Tratamiento premium',
            quantity: 1,
            subtotal: 48,
            productId: null,
            serviceId: 'service-2',
            product: null,
            service: { id: 'service-2', name: 'Tratamiento premium' }
          }
        ]
      },
      {
        id: 'sale-3',
        saleNumber: 'V-000103',
        date: new Date('2026-03-31T13:00:00.000Z'),
        total: 40,
        paymentMethod: 'BIZUM',
        clientId: null,
        client: null,
        user: { name: 'Lucy' },
        accountBalanceMovements: [],
        items: [
          {
            id: 'item-3',
            description: 'Producto retail',
            quantity: 2,
            subtotal: 40,
            productId: 'product-1',
            serviceId: null,
            product: { id: 'product-1', name: 'Producto retail' },
            service: null
          }
        ]
      }
    ])

    const req = createMockRequest({
      query: {
        startDate: '2026-03-01',
        endDate: '2026-03-31'
      }
    })
    const res = createMockResponse()

    await getSalesReport(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalSales: 3,
        collectedRevenue: 90,
        workPerformedRevenue: 168,
        averageTicket: 56,
        paymentMethods: expect.objectContaining({
          CARD: 50,
          BIZUM: 40,
          ABONO: 78
        })
      })
    )
  })
})
