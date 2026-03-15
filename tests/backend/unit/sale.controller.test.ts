import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthRequest } from '../../../src/backend/middleware/auth.middleware'
import { createSale, updateSale } from '../../../src/backend/controllers/sale.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('sale.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('creates a sale linked to an appointment and creates automatic cash movement', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000099' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000100',
          clientId: 'client-1',
          appointmentId: 'appointment-1',
          total: 100,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000100',
          total: 100,
          paymentMethod: 'CASH',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [],
          cashMovement: { id: 'movement-1' }
        })
      },
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appointment-1',
          clientId: 'client-1',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          sale: null
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'product-1', name: 'Shampoo', stock: 10 }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
        appointmentId: 'appointment-1',
        items: [
          {
            productId: 'product-1',
            serviceId: null,
            description: 'Shampoo',
            quantity: 2,
            price: 50
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CASH',
        notes: 'ok'
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { status: 'COMPLETED' }
    })
    expect(tx.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashRegisterId: 'cash-1',
          saleId: 'sale-1',
          paymentMethod: 'CASH'
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ saleNumber: 'V-000100' }))
  })

  it('auto-consumes account balance when payment method is OTHER and usage payload is omitted', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'sale-2',
          saleNumber: 'V-000001',
          clientId: 'client-1',
          appointmentId: null,
          total: 50,
          showInOfficialCash: false,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-2',
          saleNumber: 'V-000001',
          total: 50,
          paymentMethod: 'OTHER',
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: [],
          cashMovement: null
        })
      },
      product: {
        findUnique: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        findUnique: vi.fn().mockResolvedValue({ id: 'client-1', accountBalance: 50 }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cash-1' })
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      accountBalanceMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
        appointmentId: null,
        items: [
          {
            productId: null,
            serviceId: null,
            description: 'Limpieza facial',
            quantity: 1,
            price: 50
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'OTHER',
        notes: null
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(tx.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: 'OTHER',
          showInOfficialCash: false
        })
      })
    )
    expect(tx.accountBalanceMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          saleId: 'sale-2',
          type: 'CONSUMPTION',
          amount: 50,
          balanceAfter: 0
        })
      })
    )
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { accountBalance: 0 }
    })
    expect(tx.cashMovement.create).not.toHaveBeenCalled()
  })

  it('returns 400 when payment method is OTHER without a client', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({}))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: null,
        appointmentId: null,
        items: [
          {
            productId: null,
            serviceId: null,
            description: 'Limpieza facial',
            quantity: 1,
            price: 45
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'OTHER',
        notes: null
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Account balance usage requires a client'
      })
    )
  })

  it('returns 400 when stock is insufficient', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000001',
          clientId: null,
          total: 200,
          client: null,
          items: []
        })
      },
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: 'product-1', name: 'Mask', stock: 1 }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashRegister: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: null,
        items: [
          {
            productId: 'product-1',
            serviceId: null,
            description: 'Mask',
            quantity: 2,
            price: 100
          }
        ],
        discount: 0,
        tax: 0,
        paymentMethod: 'CARD',
        notes: null
      }
    })

    const res = createMockResponse()

    await createSale(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('Insufficient stock')
      })
    )
  })

  it('reverts automatic cash movement when a completed sale is cancelled', async () => {
    const tx: any = {
      sale: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sale-1',
          clientId: 'client-1',
          userId: 'user-1',
          appointmentId: 'appointment-1',
          saleNumber: 'V-000100',
          total: 80,
          status: 'COMPLETED',
          paymentMethod: 'CARD',
          notes: null,
          client: { firstName: 'Ana', lastName: 'Lopez' },
          items: []
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      cashMovement: {
        findUnique: vi.fn().mockResolvedValue({ id: 'movement-1' }),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      saleItems: {},
      product: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    }

    tx.sale.findUnique = vi.fn().mockResolvedValue({
      id: 'sale-1',
      clientId: 'client-1',
      userId: 'user-1',
      appointmentId: 'appointment-1',
      saleNumber: 'V-000100',
      total: 80,
      status: 'COMPLETED',
      paymentMethod: 'CARD',
      notes: null,
      client: { firstName: 'Ana', lastName: 'Lopez' },
      items: []
    })
    tx.sale.update = vi.fn().mockResolvedValue(undefined)

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: 'sale-1' },
      body: { status: 'CANCELLED' }
    })
    const res = createMockResponse()

    await updateSale(req as any, res)

    expect(tx.cashMovement.delete).toHaveBeenCalledWith({ where: { saleId: 'sale-1' } })
  })
})
