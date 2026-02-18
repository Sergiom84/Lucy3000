import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthRequest } from '../../../src/backend/middleware/auth.middleware'
import { createSale } from '../../../src/backend/controllers/sale.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('sale.controller.createSale', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('creates a sale and applies stock/client effects', async () => {
    const tx: any = {
      $queryRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue({ saleNumber: 'V-000099' }),
        create: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000100',
          clientId: 'client-1',
          total: 100,
          items: []
        })
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
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest<AuthRequest>({
      user: { id: 'user-1', email: 'admin@lucy3000.com', role: 'ADMIN' },
      body: {
        clientId: 'client-1',
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
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1' },
        data: { stock: { decrement: 2 } }
      })
    )
    expect(tx.client.update).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ saleNumber: 'V-000100' }))
  })

  it('returns 400 when stock is insufficient', async () => {
    const tx: any = {
      $queryRaw: vi.fn().mockResolvedValue(undefined),
      sale: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'V-000001',
          clientId: null,
          total: 200,
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
})
