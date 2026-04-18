import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBonoTemplate } from '../../../src/backend/controllers/bono.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('bono.template.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.restoreAllMocks()
  })

  it('creates a bono template and stores it in settings', async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-1',
      name: 'Maderoterapia',
      serviceCode: 'MAD-01',
      category: 'Corporal'
    })
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([])
    })
    prismaMock.setting.upsert.mockResolvedValue(undefined)
    vi.spyOn(global.Math, 'random').mockReturnValue(0.123456789)

    const req = createMockRequest({
      body: {
        description: 'Bono de 6 sesiones',
        serviceId: 'service-1',
        totalSessions: 6,
        price: 354,
        isActive: true
      }
    })
    const res = createMockResponse()

    await createBonoTemplate(req as any, res)

    expect(prismaMock.setting.upsert).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'Corporal',
        description: 'Bono de 6 sesiones',
        serviceId: 'service-1',
        serviceName: 'Maderoterapia',
        serviceLookup: 'MAD-01',
        totalSessions: 6,
        price: 354,
        isActive: true
      })
    )
  })

  it('rejects duplicate bono templates for the same service, description and sessions', async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-1',
      name: 'Maderoterapia',
      serviceCode: 'MAD-01',
      category: 'Corporal'
    })
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([
        {
          id: 'template-1',
          category: 'Corporal',
          description: 'Bono de 6 sesiones',
          serviceId: 'service-1',
          serviceName: 'Maderoterapia',
          serviceLookup: 'MAD-01',
          totalSessions: 6,
          price: 354,
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ])
    })

    const req = createMockRequest({
      body: {
        category: 'Corporal',
        description: 'bono de 6 sesiones',
        serviceId: 'service-1',
        totalSessions: 6,
        price: 360,
        isActive: true
      }
    })
    const res = createMockResponse()

    await createBonoTemplate(req as any, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Ya existe un bono con ese tratamiento, descripción y número de sesiones'
    })
    expect(prismaMock.setting.upsert).not.toHaveBeenCalled()
  })
})
