import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, updateClient } from '../../../src/backend/controllers/client.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('client.controller gender validation', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('createClient accepts HOMBRE and returns 201', async () => {
    prismaMock.client.create.mockResolvedValue({
      id: 'client-1',
      firstName: 'Juan',
      lastName: 'Perez',
      pendingAmount: 0,
      debtAlertEnabled: false,
      isActive: true
    })

    const req = createMockRequest({
      body: {
        firstName: 'Juan',
        lastName: 'Perez',
        phone: '600000000',
        gender: 'hombre'
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gender: 'HOMBRE'
        })
      })
    )
  })

  it('createClient rejects missing gender', async () => {
    const req = createMockRequest({
      body: {
        firstName: 'Ana',
        lastName: 'Lopez',
        phone: '600000001'
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Gender must be HOMBRE or MUJER'
      })
    )
    expect(prismaMock.client.create).not.toHaveBeenCalled()
  })

  it('createClient rejects invalid gender', async () => {
    const req = createMockRequest({
      body: {
        firstName: 'Ana',
        lastName: 'Lopez',
        phone: '600000001',
        gender: 'OTRO'
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Gender must be HOMBRE or MUJER'
      })
    )
    expect(prismaMock.client.create).not.toHaveBeenCalled()
  })

  it('createClient normalizes null totalSpent to zero', async () => {
    prismaMock.client.create.mockResolvedValue({
      id: 'client-1',
      firstName: 'Sergio',
      lastName: 'Hernandez Lara',
      pendingAmount: 0,
      debtAlertEnabled: false,
      isActive: true
    })

    const req = createMockRequest({
      body: {
        firstName: 'Sergio',
        lastName: 'Hernandez Lara',
        phone: '600000000',
        gender: 'HOMBRE',
        totalSpent: null
      }
    })
    const res = createMockResponse()

    await createClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalSpent: 0
        })
      })
    )
  })

  it('updateClient rejects invalid gender when provided', async () => {
    const req = createMockRequest({
      params: { id: 'client-1' },
      body: {
        gender: 'OTRO'
      }
    })
    const res = createMockResponse()

    await updateClient(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Gender must be HOMBRE or MUJER'
      })
    )
    expect(prismaMock.client.update).not.toHaveBeenCalled()
  })

  it('updateClient keeps behavior when gender is not provided', async () => {
    prismaMock.client.update.mockResolvedValue({
      id: 'client-1',
      firstName: 'Ana',
      lastName: 'Lopez',
      pendingAmount: 0,
      debtAlertEnabled: false,
      isActive: true
    })

    const req = createMockRequest({
      params: { id: 'client-1' },
      body: {
        notes: 'Actualizada'
      }
    })
    const res = createMockResponse()

    await updateClient(req as any, res)

    expect(prismaMock.client.update).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalledWith(400)
  })
})
