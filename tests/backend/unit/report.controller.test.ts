import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCashReport, getSalesReport } from '../../../src/backend/controllers/report.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('report.controller sales report', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('separates collected revenue from work performed and adds abono, bono consumption and top services summaries', async () => {
    prismaMock.sale.findMany
      .mockResolvedValueOnce([
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
      .mockResolvedValueOnce([
        {
          items: [
            {
              description: 'Limpieza facial',
              quantity: 2,
              price: 40,
              subtotal: 80,
              serviceId: 'service-1',
              service: { id: 'service-1', name: 'Limpieza facial' }
            },
            {
              description: 'Bono Premium',
              quantity: 1,
              price: 120,
              subtotal: 120,
              serviceId: 'service-bono',
              service: { id: 'service-bono', name: 'Tratamiento premium' }
            }
          ]
        }
      ])
    prismaMock.accountBalanceMovement.findMany.mockResolvedValue([
      { type: 'TOP_UP', amount: 25 },
      { type: 'CONSUMPTION', amount: 48 }
    ])
    prismaMock.bonoPack.findMany.mockResolvedValue([
      {
        price: 120,
        totalSessions: 3,
        sessions: [{ id: 'session-1' }, { id: 'session-2' }]
      },
      {
        price: 90,
        totalSessions: 3,
        sessions: []
      }
    ])
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify([
        {
          id: 'template-1',
          description: 'Bono Premium',
          serviceId: 'service-bono',
          price: 120,
          isActive: true
        }
      ])
    })

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
        }),
        accountBalanceSummary: {
          topUpCount: 1,
          topUpTotal: 25,
          consumptionCount: 1,
          consumptionTotal: 48
        },
        bonoSummary: {
          consumedSessions: 2,
          consumedAmount: 80
        },
        topServices: [
          {
            id: 'service-1',
            name: 'Limpieza facial',
            quantity: 2,
            revenue: 80
          }
        ],
        topProducts: [
          { name: 'Producto retail', quantity: 2 }
        ],
        sales: expect.any(Array)
      })
    )

    expect(prismaMock.sale.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETED'
        })
      })
    )
    expect(prismaMock.sale.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: 'COMPLETED'
        }
      })
    )
    expect(prismaMock.setting.findUnique).toHaveBeenCalledWith({
      where: { key: 'bono_templates_catalog' },
      select: { value: true }
    })
  })
})

describe('report.controller cash report', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('filters cash data by movement date instead of cash register opening date', async () => {
    prismaMock.cashRegister.findMany.mockResolvedValue([
      {
        id: 'cash-1',
        date: new Date('2026-03-30T18:41:48.149Z'),
        movements: [
          {
            id: 'movement-1',
            type: 'INCOME',
            amount: 20,
            date: new Date('2026-04-16T17:06:22.543Z')
          }
        ]
      }
    ])

    const req = createMockRequest({
      query: {
        startDate: '2026-04-01',
        endDate: '2026-04-30'
      }
    })
    const res = createMockResponse()

    await getCashReport(req as any, res)

    expect(prismaMock.cashRegister.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          movements: {
            some: {
              date: expect.objectContaining({
                gte: expect.any(Date),
                lte: expect.any(Date)
              })
            }
          }
        },
        include: {
          movements: {
            where: {
              date: expect.objectContaining({
                gte: expect.any(Date),
                lte: expect.any(Date)
              })
            }
          }
        }
      })
    )

    expect(res.json).toHaveBeenCalledWith({
      totalIncome: 20,
      totalExpenses: 0,
      totalWithdrawals: 0,
      totalDeposits: 0,
      netCashFlow: 20,
      cashRegisters: [
        expect.objectContaining({
          id: 'cash-1'
        })
      ]
    })
  })
})
