import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCashMovement, openCashRegister } from '../../../src/backend/controllers/cash.controller'
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
      openingBalance: 100
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
        reference: null
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
})
