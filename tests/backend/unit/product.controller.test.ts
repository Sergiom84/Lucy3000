import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addStockMovement } from '../../../src/backend/controllers/product.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('product.controller.addStockMovement', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('rejects negative quantity for non-adjustment movement', async () => {
    const req = createMockRequest({
      params: { id: '8d8af31f-8e65-4550-b4ad-52f50e72ef54' },
      body: {
        type: 'SALE',
        quantity: -5,
        reason: 'invalid',
        reference: null
      }
    })
    const res = createMockResponse()

    await addStockMovement(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Quantity must be positive for this movement type'
      })
    )
  })

  it('applies signed ADJUSTMENT movement in transaction', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: '8d8af31f-8e65-4550-b4ad-52f50e72ef54',
      stock: 10
    })

    const tx: any = {
      stockMovement: {
        create: vi.fn().mockResolvedValue({
          id: 'movement-1',
          type: 'ADJUSTMENT',
          quantity: -3
        })
      },
      product: {
        update: vi.fn().mockResolvedValue(undefined)
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: '8d8af31f-8e65-4550-b4ad-52f50e72ef54' },
      body: {
        type: 'ADJUSTMENT',
        quantity: -3,
        reason: 'correccion',
        reference: 'INV-1'
      }
    })
    const res = createMockResponse()

    await addStockMovement(req as any, res)

    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '8d8af31f-8e65-4550-b4ad-52f50e72ef54' },
        data: { stock: 7 }
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })
})
