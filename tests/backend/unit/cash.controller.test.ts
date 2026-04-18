import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCashMovement,
  getCashAnalytics,
  getPrivateNoTicketCashSales,
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
    prismaMock.$transaction.mockImplementation(async (input: any) => {
      if (Array.isArray(input)) {
        return Promise.all(input)
      }

      if (typeof input === 'function') {
        return input(prismaMock)
      }

      return undefined
    })
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
        { type: 'EXPENSE', amount: 15, paymentMethod: null, user: { name: 'Admin' } },
        { type: 'INCOME', amount: 50, paymentMethod: 'CASH', user: { name: 'Admin' } },
        { type: 'INCOME', amount: 20, paymentMethod: 'CASH', user: { name: 'Admin' } }
      ]
    })
    prismaMock.sale.findMany
      .mockResolvedValueOnce([
        { total: 50, paymentMethod: 'CASH', accountBalanceMovements: [] },
        { total: 40, paymentMethod: 'CARD', accountBalanceMovements: [] },
        {
          total: 80,
          paymentMethod: 'CARD',
          accountBalanceMovements: [{ type: 'CONSUMPTION', amount: 30 }]
        },
        {
          total: 48,
          paymentMethod: 'OTHER',
          accountBalanceMovements: [{ type: 'CONSUMPTION', amount: 48 }]
        }
      ])
      .mockResolvedValueOnce([{ total: 90, paymentMethod: 'CARD', accountBalanceMovements: [] }])
      .mockResolvedValueOnce([{ total: 300, paymentMethod: 'BIZUM', accountBalanceMovements: [] }])
    prismaMock.accountBalanceMovement.findMany
      .mockResolvedValueOnce([{ type: 'TOP_UP', amount: 20, paymentMethod: 'CASH' }])
      .mockResolvedValueOnce([{ type: 'TOP_UP', amount: 20, paymentMethod: 'CASH' }])
      .mockResolvedValueOnce([{ type: 'TOP_UP', amount: 45, paymentMethod: 'CARD' }])

    const req = createMockRequest()
    const res = createMockResponse()

    await getCashSummary(req as any, res)

    expect(prismaMock.sale.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETED',
          NOT: {
            paymentMethod: 'CASH',
            showInOfficialCash: false
          }
        })
      })
    )

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.objectContaining({
          openingBalance: 100,
          currentBalance: 175,
          paymentsByMethod: expect.objectContaining({
            CASH: 70,
            CARD: 90,
            BIZUM: 0,
            ABONO: 78
          }),
          income: expect.objectContaining({
            day: 160
          }),
          workPerformed: expect.objectContaining({
            day: 218
          })
        })
      })
    )
  })

  it('returns analytics rows splitting mixed sales by payment method', async () => {
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        saleNumber: 'V-000100',
        date: new Date('2026-03-07T10:00:00.000Z'),
        clientId: 'client-1',
        professional: 'TAMARA',
        total: 80,
        paymentMethod: 'CARD',
        accountBalanceMovements: [{ type: 'CONSUMPTION', amount: 30 }],
        client: { id: 'client-1', firstName: 'Ana', lastName: 'Lopez' },
        user: { name: 'Administrador' },
        items: [
          {
            id: 'item-1',
            description: 'Limpieza facial',
            quantity: 1,
            subtotal: 80,
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

    expect(prismaMock.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETED',
          NOT: {
            paymentMethod: 'CASH',
            showInOfficialCash: false
          }
        })
      })
    )

    expect(res.json).toHaveBeenCalledWith({
      rows: expect.arrayContaining([
        expect.objectContaining({
          clientName: 'Ana Lopez',
          concept: 'Limpieza facial',
          paymentMethod: 'CARD',
          professionalName: 'Tamara',
          amount: 50
        }),
        expect.objectContaining({
          clientName: 'Ana Lopez',
          concept: 'Limpieza facial',
          paymentMethod: 'ABONO',
          professionalName: 'Tamara',
          amount: 30
        })
      ])
    })
  })

  it('returns the selected professional for private no-ticket cash sales', async () => {
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-9',
        saleNumber: 'V-000009',
        date: new Date('2026-03-31T13:57:00.000Z'),
        total: 70,
        notes: null,
        professional: 'CHEMA',
        client: { firstName: 'Sergio', lastName: 'Hernandez Lara' },
        user: { name: 'Administrador' }
      }
    ])

    const req = createMockRequest({
      query: {
        pin: '0852'
      }
    })
    const res = createMockResponse()

    await getPrivateNoTicketCashSales(req as any, res)

    expect(res.json).toHaveBeenCalledWith({
      rows: [
        expect.objectContaining({
          clientName: 'Sergio Hernandez Lara',
          professionalName: 'Chema'
        })
      ],
      totalAmount: 70
    })
  })
})
