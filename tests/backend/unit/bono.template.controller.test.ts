import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBonoTemplate,
  deleteBonoTemplateCategory,
  deleteBonoTemplateCategoryWithTemplates,
  importBonoTemplatesFromExcel,
  renameBonoTemplateCategory
} from '../../../src/backend/controllers/bono.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { createWorkbookBuffer } from '../helpers/spreadsheet'
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

  it('renames a bonus family across the template catalog', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([
        {
          id: 'template-1',
          category: 'Corporal',
          description: 'Bono de 4 sesiones',
          serviceId: 'service-1',
          serviceName: 'Maderoterapia',
          serviceLookup: 'MAD-01',
          totalSessions: 4,
          price: 220,
          isActive: true,
          createdAt: '2026-01-10T10:00:00.000Z'
        }
      ])
    })
    prismaMock.setting.upsert.mockResolvedValue(undefined)

    const req = createMockRequest({
      body: {
        currentCategory: 'Corporal',
        nextCategory: 'Corporal Premium'
      }
    })
    const res = createMockResponse()

    await renameBonoTemplateCategory(req as any, res)

    const storedCatalog = JSON.parse(prismaMock.setting.upsert.mock.calls[0][0].update.value)
    expect(storedCatalog[0]).toEqual(
      expect.objectContaining({
        category: 'Corporal Premium'
      })
    )
    expect(res.json).toHaveBeenCalledWith({
      message: 'Familia de bonos actualizada correctamente',
      category: 'Corporal Premium',
      affectedTemplates: 1
    })
  })

  it('deletes a bonus family by moving its templates to another category', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([
        {
          id: 'template-1',
          category: 'Corporal',
          description: 'Bono de 4 sesiones',
          serviceId: 'service-1',
          serviceName: 'Maderoterapia',
          serviceLookup: 'MAD-01',
          totalSessions: 4,
          price: 220,
          isActive: true,
          createdAt: '2026-01-10T10:00:00.000Z'
        }
      ])
    })
    prismaMock.setting.upsert.mockResolvedValue(undefined)

    const req = createMockRequest({
      body: {
        category: 'Corporal',
        replacementCategory: 'Bonos'
      }
    })
    const res = createMockResponse()

    await deleteBonoTemplateCategory(req as any, res)

    const storedCatalog = JSON.parse(prismaMock.setting.upsert.mock.calls[0][0].update.value)
    expect(storedCatalog[0]).toEqual(
      expect.objectContaining({
        category: 'Bonos'
      })
    )
    expect(res.json).toHaveBeenCalledWith({
      message: 'Familia de bonos eliminada correctamente',
      category: 'Bonos',
      affectedTemplates: 1
    })
  })

  it('deletes a bonus family together with all its templates', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([
        {
          id: 'template-1',
          category: 'Corporal',
          description: 'Bono de 4 sesiones',
          serviceId: 'service-1',
          serviceName: 'Maderoterapia',
          serviceLookup: 'MAD-01',
          totalSessions: 4,
          price: 220,
          isActive: true,
          createdAt: '2026-01-10T10:00:00.000Z'
        },
        {
          id: 'template-2',
          category: 'Facial',
          description: 'Bono de 2 sesiones',
          serviceId: 'service-2',
          serviceName: 'Limpieza facial',
          serviceLookup: 'LIMP-01',
          totalSessions: 2,
          price: 90,
          isActive: true,
          createdAt: '2026-01-12T10:00:00.000Z'
        }
      ])
    })
    prismaMock.setting.upsert.mockResolvedValue(undefined)

    const req = createMockRequest({
      body: {
        category: 'Corporal'
      }
    })
    const res = createMockResponse()

    await deleteBonoTemplateCategoryWithTemplates(req as any, res)

    const storedCatalog = JSON.parse(prismaMock.setting.upsert.mock.calls[0][0].update.value)
    expect(storedCatalog).toHaveLength(1)
    expect(storedCatalog[0]).toEqual(
      expect.objectContaining({
        category: 'Facial'
      })
    )
    expect(res.json).toHaveBeenCalledWith({
      message: 'Familia y bonos eliminados correctamente',
      affectedTemplates: 1
    })
  })

  it('merges imported bonus templates with the existing catalog', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Maderoterapia',
        serviceCode: 'MAD-01',
        category: 'Corporal'
      },
      {
        id: 'service-2',
        name: 'Presoterapia',
        serviceCode: 'PRE-01',
        category: 'Corporal'
      }
    ])
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([
        {
          id: 'template-1',
          category: 'Corporal',
          description: 'Bono de 4 sesiones',
          serviceId: 'service-1',
          serviceName: 'Maderoterapia',
          serviceLookup: 'MAD-01',
          totalSessions: 4,
          price: 220,
          isActive: true,
          createdAt: '2026-01-10T10:00:00.000Z'
        }
      ])
    })
    prismaMock.setting.upsert.mockResolvedValue(undefined)

    const buffer = await createWorkbookBuffer([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1'],
      ['Corporal', 'PRE-01', 'Bono de 6 sesiones', '354']
    ], 'Bonos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importBonoTemplatesFromExcel(req as any, res)

    expect(prismaMock.setting.upsert).toHaveBeenCalledTimes(1)
    const storedCatalog = JSON.parse(prismaMock.setting.upsert.mock.calls[0][0].update.value)
    expect(storedCatalog).toHaveLength(2)
    expect(storedCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'template-1',
          description: 'Bono de 4 sesiones',
          serviceId: 'service-1'
        }),
        expect.objectContaining({
          description: 'Bono de 6 sesiones',
          serviceId: 'service-2',
          serviceLookup: 'PRE-01',
          totalSessions: 6,
          price: 354
        })
      ])
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          created: 1,
          updated: 0,
          skipped: 0
        })
      })
    )
  })

  it('updates existing bonus templates and skips duplicate rows inside the Excel', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Maderoterapia',
        serviceCode: 'MAD-01',
        category: 'Corporal'
      }
    ])
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
          price: 320,
          isActive: true,
          createdAt: '2026-01-10T10:00:00.000Z'
        }
      ])
    })
    prismaMock.setting.upsert.mockResolvedValue(undefined)

    const buffer = await createWorkbookBuffer([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1'],
      ['Corporal', 'MAD-01', 'Bono de 6 sesiones', '354'],
      ['Corporal', 'MAD-01', 'Bono de 6 sesiones', '354']
    ], 'Bonos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importBonoTemplatesFromExcel(req as any, res)

    const storedCatalog = JSON.parse(prismaMock.setting.upsert.mock.calls[0][0].update.value)
    expect(storedCatalog).toHaveLength(1)
    expect(storedCatalog[0]).toEqual(
      expect.objectContaining({
        id: 'template-1',
        description: 'Bono de 6 sesiones',
        serviceId: 'service-1',
        price: 354
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          created: 0,
          updated: 1,
          skipped: 1
        })
      })
    )
  })
})
