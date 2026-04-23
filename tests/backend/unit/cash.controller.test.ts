import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCashMovement,
  closeCashRegister,
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
      .mockResolvedValueOnce([
        { total: 30, paymentMethod: 'CASH', showInOfficialCash: false, accountBalanceMovements: [] }
      ])
    prismaMock.pendingPaymentCollection.findMany
      .mockResolvedValueOnce([
        { amount: 25, paymentMethod: 'CARD', showInOfficialCash: true },
        { amount: 10, paymentMethod: 'ABONO', showInOfficialCash: false }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ amount: 12, paymentMethod: 'CASH', showInOfficialCash: false }])
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
          pendingPayment: null,
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
            CARD: 115,
            BIZUM: 0,
            ABONO: 88
          }),
          closingSummary: expect.objectContaining({
            expectedOfficialCash: 175,
            officialCashCollected: 70,
            cardCollected: 115,
            bizumCollected: 0,
            privateCashCollected: 42,
            totalCollectedExcludingAbono: 227
          }),
          income: expect.objectContaining({
            day: 185
          }),
          workPerformed: expect.objectContaining({
            day: 218
          })
        })
      })
    )
  })

  it('excludes the private cash leg of a combined sale from official summary totals', async () => {
    const combinedSale = {
      total: 200,
      paymentMethod: 'OTHER',
      paymentBreakdown:
        '[{"paymentMethod":"CARD","amount":120},{"paymentMethod":"CASH","amount":80,"showInOfficialCash":false}]',
      accountBalanceMovements: []
    }

    prismaMock.cashRegister.findFirst.mockResolvedValue({
      id: 'cash-1',
      openingBalance: 50,
      status: 'OPEN',
      movements: []
    })
    prismaMock.sale.findMany
      .mockResolvedValueOnce([combinedSale])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([combinedSale])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prismaMock.pendingPaymentCollection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prismaMock.accountBalanceMovement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const req = createMockRequest()
    const res = createMockResponse()

    await getCashSummary(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.objectContaining({
          openingBalance: 50,
          currentBalance: 50,
          paymentsByMethod: expect.objectContaining({
            CASH: 0,
            CARD: 120,
            BIZUM: 0,
            ABONO: 0
          }),
          closingSummary: expect.objectContaining({
            expectedOfficialCash: 50,
            officialCashCollected: 0,
            cardCollected: 120,
            bizumCollected: 0,
            privateCashCollected: 80,
            totalCollectedExcludingAbono: 200
          }),
          income: expect.objectContaining({
            day: 120
          }),
          workPerformed: expect.objectContaining({
            day: 200
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
    prismaMock.pendingPaymentCollection.findMany.mockResolvedValue([])

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
          pendingPayment: null,
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
        paymentMethod: 'CASH',
        showInOfficialCash: false,
        notes: null,
        professional: 'CHEMA',
        client: { firstName: 'Sergio', lastName: 'Hernandez Lara' },
        user: { name: 'Administrador' },
        items: [{ description: 'Higiene facial' }]
      }
    ])
    prismaMock.pendingPaymentCollection.findMany.mockResolvedValue([
      {
        id: 'collection-1',
        amount: 30,
        operationDate: new Date('2026-03-31T14:30:00.000Z'),
        sale: {
          saleNumber: 'V-000010',
          professional: 'LUCY',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          appointment: null,
          user: { name: 'Administrador' },
          items: [{ description: 'Radiofrecuencia' }]
        }
      }
    ])

    const req = createMockRequest({
      query: {
        pin: '0852'
      }
    })
    const res = createMockResponse()

    await getPrivateNoTicketCashSales(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({
            clientName: 'Sergio Hernandez Lara',
            professionalName: 'Chema',
            paymentDetail: 'Efectivo privado',
            treatmentName: 'Higiene facial'
          }),
          expect.objectContaining({
            clientName: 'Ana Lopez',
            professionalName: 'Lucy',
            paymentDetail: 'Cobro pendiente · efectivo privado',
            treatmentName: 'Radiofrecuencia'
          })
        ]),
        totalAmount: 100
      })
    )
  })

  it('applies the selected date range to private cash queries', async () => {
    prismaMock.sale.findMany.mockResolvedValue([])
    prismaMock.pendingPaymentCollection.findMany.mockResolvedValue([])

    const req = createMockRequest({
      query: {
        pin: '0852',
        startDate: '2026-03-01',
        endDate: '2026-03-31'
      }
    })
    const res = createMockResponse()

    await getPrivateNoTicketCashSales(req as any, res)

    const saleArgs = prismaMock.sale.findMany.mock.calls[0][0]
    const collectionArgs = prismaMock.pendingPaymentCollection.findMany.mock.calls[0][0]

    expect(saleArgs.where.date.gte).toBeInstanceOf(Date)
    expect(saleArgs.where.date.lte).toBeInstanceOf(Date)
    expect(saleArgs.where.date.gte.getHours()).toBe(0)
    expect(saleArgs.where.date.lte.getHours()).toBe(23)
    expect(saleArgs.where.date.gte.getDate()).toBe(1)
    expect(saleArgs.where.date.lte.getDate()).toBe(31)

    expect(collectionArgs.where.operationDate.gte).toBeInstanceOf(Date)
    expect(collectionArgs.where.operationDate.lte).toBeInstanceOf(Date)
    expect(collectionArgs.where.operationDate.gte.getHours()).toBe(0)
    expect(collectionArgs.where.operationDate.lte.getHours()).toBe(23)
    expect(collectionArgs.where.operationDate.gte.getDate()).toBe(1)
    expect(collectionArgs.where.operationDate.lte.getDate()).toBe(31)
  })

  it('opens cash register inheriting last closure float when requested', async () => {
    prismaMock.cashRegister.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'cash-prev',
        closedAt: new Date('2026-04-21T21:00:00.000Z'),
        nextDayFloat: 125,
        nextDayFloatDenominations: JSON.stringify({ 'bill-20': 5, 'bill-10': 2, 'coin-1e': 5 })
      })
    prismaMock.cashRegister.create.mockResolvedValue({
      id: 'cash-new',
      status: 'OPEN',
      openingBalance: 125,
      movements: []
    })

    const req = createMockRequest({
      body: { useLastClosureFloat: true }
    })
    const res = createMockResponse()

    await openCashRegister(req as any, res)

    expect(prismaMock.cashRegister.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          openingBalance: 125,
          openingDenominations: JSON.stringify({ 'bill-20': 5, 'bill-10': 2, 'coin-1e': 5 })
        })
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects open-with-inherited-float when no previous closure exists', async () => {
    prismaMock.cashRegister.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const req = createMockRequest({
      body: { useLastClosureFloat: true }
    })
    const res = createMockResponse()

    await openCashRegister(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prismaMock.cashRegister.create).not.toHaveBeenCalled()
  })

  it('closes register with next day float and creates automatic WITHDRAWAL movement', async () => {
    prismaMock.cashRegister.findUnique.mockResolvedValue({
      id: 'cash-1',
      status: 'OPEN',
      openingBalance: 50,
      movements: [
        { type: 'INCOME', amount: 100, paymentMethod: 'CASH' }
      ]
    })
    prismaMock.cashMovement.create.mockResolvedValue({ id: 'mov-1' })
    prismaMock.cashRegister.update.mockResolvedValue({
      id: 'cash-1',
      status: 'CLOSED',
      nextDayFloat: 50,
      countedTotal: 150,
      withdrawalAmount: 100,
      arqueoDifference: 0
    })

    const req = createMockRequest<AuthRequest>({
      params: { id: 'cash-1' } as any,
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        countedTotal: 150,
        countedDenominations: { 'bill-50': 2, 'bill-20': 2, 'bill-10': 1 },
        nextDayFloat: 50,
        nextDayFloatDenominations: { 'bill-20': 2, 'bill-10': 1 }
      }
    })
    const res = createMockResponse()

    await closeCashRegister(req, res)

    expect(prismaMock.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'WITHDRAWAL',
          amount: 100,
          userId: 'user-1',
          category: 'Retirada de cierre'
        })
      })
    )
    expect(prismaMock.cashRegister.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CLOSED',
          countedTotal: 150,
          nextDayFloat: 50,
          withdrawalAmount: 100,
          arqueoDifference: 0,
          closingBalance: 50
        })
      })
    )
    expect(res.json).toHaveBeenCalled()
  })

  it('does not create withdrawal movement when counted cash equals next day float', async () => {
    prismaMock.cashRegister.findUnique.mockResolvedValue({
      id: 'cash-1',
      status: 'OPEN',
      openingBalance: 50,
      movements: []
    })
    prismaMock.cashRegister.update.mockResolvedValue({ id: 'cash-1', status: 'CLOSED' })

    const req = createMockRequest<AuthRequest>({
      params: { id: 'cash-1' } as any,
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        countedTotal: 50,
        nextDayFloat: 50
      }
    })
    const res = createMockResponse()

    await closeCashRegister(req, res)

    expect(prismaMock.cashMovement.create).not.toHaveBeenCalled()
    expect(prismaMock.cashRegister.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          withdrawalAmount: 0,
          nextDayFloat: 50
        })
      })
    )
  })

  it('persists arqueo difference separately from withdrawal', async () => {
    prismaMock.cashRegister.findUnique.mockResolvedValue({
      id: 'cash-1',
      status: 'OPEN',
      openingBalance: 100,
      movements: [{ type: 'INCOME', amount: 50, paymentMethod: 'CASH' }]
    })
    prismaMock.cashMovement.create.mockResolvedValue({ id: 'mov-1' })
    prismaMock.cashRegister.update.mockResolvedValue({ id: 'cash-1', status: 'CLOSED' })

    const req = createMockRequest<AuthRequest>({
      params: { id: 'cash-1' } as any,
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        countedTotal: 145,
        nextDayFloat: 100,
        differenceReason: 'Vuelto incorrecto'
      }
    })
    const res = createMockResponse()

    await closeCashRegister(req, res)

    expect(prismaMock.cashRegister.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          countedTotal: 145,
          arqueoDifference: -5,
          nextDayFloat: 100,
          withdrawalAmount: 45,
          notes: expect.stringContaining('Vuelto incorrecto')
        })
      })
    )
  })

  it('rejects close when next day float exceeds counted cash', async () => {
    prismaMock.cashRegister.findUnique.mockResolvedValue({
      id: 'cash-1',
      status: 'OPEN',
      openingBalance: 50,
      movements: []
    })

    const req = createMockRequest<AuthRequest>({
      params: { id: 'cash-1' } as any,
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        countedTotal: 40,
        nextDayFloat: 100
      }
    })
    const res = createMockResponse()

    await closeCashRegister(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prismaMock.cashRegister.update).not.toHaveBeenCalled()
  })

  it('returns the private cash leg of a combined sale in the private cash section', async () => {
    prismaMock.sale.findMany.mockResolvedValue([
      {
        id: 'sale-combined-9',
        saleNumber: 'V-000011',
        date: new Date('2026-03-31T15:00:00.000Z'),
        total: 140,
        paymentMethod: 'OTHER',
        paymentBreakdown:
          '[{"paymentMethod":"BIZUM","amount":105},{"paymentMethod":"CASH","amount":35,"showInOfficialCash":false}]',
        notes: 'pago mixto',
        professional: 'LUCY',
        client: { firstName: 'Ana', lastName: 'Lopez' },
        appointment: null,
        user: { name: 'Administrador' },
        items: [{ description: 'Pack corporal' }]
      }
    ])
    prismaMock.pendingPaymentCollection.findMany.mockResolvedValue([])

    const req = createMockRequest({
      query: {
        pin: '0852'
      }
    })
    const res = createMockResponse()

    await getPrivateNoTicketCashSales(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({
            saleNumber: 'V-000011',
            clientName: 'Ana Lopez',
            professionalName: 'Lucy',
            amount: 35,
            paymentDetail: 'Pago mixto · efectivo privado',
            treatmentName: 'Pack corporal'
          })
        ]),
        totalAmount: 35
      })
    )
  })
})
