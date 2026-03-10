import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCashMovement,
  getCashAnalytics,
  getCashSummary,
  openCashRegister
} from '../../../src/backend/controllers/cash.controller'
import { AuthRequest } from '../../../src/backend/middleware/auth.middleware'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('cash.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('opens cash register when there is no open one', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValue(null)
    prismaMock.cashRegister.create.mockResolvedValue({
      id: 'cash-1',
      status: 'OPEN',
      openingBalance: 100,
      movements: []
    })

    const req = createMockRequest({
      body: {
        openingBalance: 100,
        notes: 'inicio'
      }
    })
    const res = createMockResponse()

    await openCashRegister(req as any, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(prismaMock.cashRegister.create).toHaveBeenCalledTimes(1)
  })

  it('rejects movement when cash register is closed', async () => {
    prismaMock.cashRegister.findUnique.mockResolvedValue({
      id: 'cash-1',
      status: 'CLOSED'
    })

    const req = createMockRequest<AuthRequest>({
      params: { id: 'cash-1' } as any,
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        type: 'EXPENSE',
        amount: 30,
        category: 'Compras',
        description: 'Compra de material',
        reference: null,
        paymentMethod: null
      }
    })
    const res = createMockResponse()

    await addCashMovement(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Cannot add movements to a closed cash register'
      })
    )
  })

  it('builds summary cards with payment breakdown and current balance', async () => {
    prismaMock.cashRegister.findFirst.mockResolvedValue({
      id: 'cash-1',
      openingBalance: 100,
      status: 'OPEN',
      movements: [
        { type: 'DEPOSIT', amount: 20, paymentMethod: null, user: { name: 'Admin' } },
        { type: 'EXPENSE', amount: 15, paymentMethod: null, user: { name: 'Admin' } }
      ]
    })
    prismaMock.sale.findMany
      .mockResolvedValueOnce([
        { total: 50, paymentMethod: 'CASH' },
        { total: 40, paymentMethod: 'CARD' }
      ])
      .mockResolvedValueOnce([{ total: 90 }])
      .mockResolvedValueOnce([{ total: 300 }])

    const req = createMockRequest()
    const res = createMockResponse()

    await getCashSummary(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.objectContaining({
          openingBalance: 100,
          currentBalance: 155
        })
      })
    )
  })

  it('returns analytics rows grouped from completed sales', async () => {
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        saleNumber: 'V-000100',
        date: new Date('2026-03-07T10:00:00.000Z'),
        clientId: 'client-1',
        paymentMethod: 'BIZUM',
        client: { id: 'client-1', firstName: 'Ana', lastName: 'Lopez' },
        items: [
          {
            id: 'item-1',
            description: 'Limpieza facial',
            quantity: 1,
            subtotal: 65,
            serviceId: 'service-1',
            productId: null,
            service: { id: 'service-1', name: 'Limpieza facial' },
            product: null
          }
        ]
      }
    ])

    const req = createMockRequest({
      query: {
        period: 'DAY',
        type: 'ALL'
      }
    })
    const res = createMockResponse()

    await getCashAnalytics(req as any, res)

    expect(res.json).toHaveBeenCalledWith({
      rows: [
        expect.objectContaining({
          clientName: 'Ana Lopez',
          concept: 'Limpieza facial',
          paymentMethod: 'BIZUM',
          amount: 65
        })
      ]
    })
  })
})
