import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createService,
  deleteService,
  deleteServiceCategory,
  deleteServiceCategoryWithServices,
  getServices,
  importServicesFromExcel,
  renameServiceCategory
} from '../../../src/backend/controllers/service.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'
import { createWorkbookBuffer } from '../helpers/spreadsheet'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('service.controller createService', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('rejects creating services without category', async () => {
    const req = createMockRequest({
      body: {
        name: 'Limpieza facial',
        price: '45',
        duration: '60'
      },
      user: {
        id: 'user-1',
        role: 'ADMIN',
        email: 'admin@example.com'
      }
    })
    const res = createMockResponse()

    await createService(req as any, res)

    expect(prismaMock.service.create).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Category is required' })
  })
})

describe('service.controller deleteService', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('blocks deleting a service that is used by bono templates', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify([
        {
          id: 'template-1',
          serviceId: 'service-1'
        }
      ])
    })

    const req = createMockRequest({
      params: {
        id: 'service-1'
      }
    })
    const res = createMockResponse()

    await deleteService(req as any, res)

    expect(prismaMock.service.delete).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      error: 'No se puede eliminar el tratamiento porque está vinculado a bonos del catálogo'
    })
  })
})

describe('service.controller category management', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('renames a family and updates its appointment legend when there is no target legend', async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: 'service-1' }, { id: 'service-2' }])
    prismaMock.service.updateMany.mockResolvedValue({ count: 2 })
    prismaMock.appointmentLegend.findMany.mockResolvedValue([
      { id: 'legend-1', name: 'Cejas y pestañas' }
    ])
    prismaMock.appointmentLegend.update.mockResolvedValue({})

    const req = createMockRequest({
      body: {
        currentCategory: 'Cejas y pestañas',
        nextCategory: 'Mirada'
      }
    })
    const res = createMockResponse()

    await renameServiceCategory(req as any, res)

    expect(prismaMock.service.updateMany).toHaveBeenCalledWith({
      where: { category: 'Cejas y pestañas' },
      data: { category: 'Mirada' }
    })
    expect(prismaMock.appointmentLegend.update).toHaveBeenCalledWith({
      where: { id: 'legend-1' },
      data: { name: 'Mirada' }
    })
    expect(prismaMock.appointmentLegend.delete).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({
      message: 'Familia actualizada correctamente',
      category: 'Mirada',
      affectedServices: 2
    })
  })

  it('merges a family into another one and removes the previous legend when the target legend already exists', async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: 'service-1' }])
    prismaMock.service.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.appointmentLegend.findMany.mockResolvedValue([
      { id: 'legend-1', name: 'Cejas y pestañas' },
      { id: 'legend-2', name: 'Faciales' }
    ])
    prismaMock.appointmentLegend.delete.mockResolvedValue({})

    const req = createMockRequest({
      body: {
        currentCategory: 'Cejas y pestañas',
        nextCategory: 'Faciales'
      }
    })
    const res = createMockResponse()

    await renameServiceCategory(req as any, res)

    expect(prismaMock.service.updateMany).toHaveBeenCalledWith({
      where: { category: 'Cejas y pestañas' },
      data: { category: 'Faciales' }
    })
    expect(prismaMock.appointmentLegend.delete).toHaveBeenCalledWith({
      where: { id: 'legend-1' }
    })
    expect(prismaMock.appointmentLegend.update).not.toHaveBeenCalled()
  })

  it('deletes a family by moving its services to another category and removing its legend', async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: 'service-1' }, { id: 'service-2' }])
    prismaMock.service.updateMany.mockResolvedValue({ count: 2 })
    prismaMock.appointmentLegend.findMany.mockResolvedValue([
      { id: 'legend-1', name: 'Cejas y pestañas' }
    ])
    prismaMock.appointmentLegend.delete.mockResolvedValue({})

    const req = createMockRequest({
      body: {
        category: 'Cejas y pestañas',
        replacementCategory: 'Sin categoría'
      }
    })
    const res = createMockResponse()

    await deleteServiceCategory(req as any, res)

    expect(prismaMock.service.updateMany).toHaveBeenCalledWith({
      where: { category: 'Cejas y pestañas' },
      data: { category: 'Sin categoría' }
    })
    expect(prismaMock.appointmentLegend.delete).toHaveBeenCalledWith({
      where: { id: 'legend-1' }
    })
    expect(res.json).toHaveBeenCalledWith({
      message: 'Familia eliminada correctamente',
      category: 'Sin categoría',
      affectedServices: 2
    })
  })

  it('deletes a family together with all its services when they are not linked elsewhere', async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: 'service-1' }, { id: 'service-2' }])
    prismaMock.setting.findUnique.mockResolvedValue(null)
    prismaMock.service.deleteMany.mockResolvedValue({ count: 2 })
    prismaMock.appointmentLegend.findMany.mockResolvedValue([
      { id: 'legend-1', name: 'Prueba' }
    ])
    prismaMock.appointmentLegend.delete.mockResolvedValue({})

    const req = createMockRequest({
      body: {
        category: 'Prueba'
      }
    })
    const res = createMockResponse()

    await deleteServiceCategoryWithServices(req as any, res)

    expect(prismaMock.service.deleteMany).toHaveBeenCalledWith({
      where: { category: 'Prueba' }
    })
    expect(prismaMock.appointmentLegend.delete).toHaveBeenCalledWith({
      where: { id: 'legend-1' }
    })
    expect(res.json).toHaveBeenCalledWith({
      message: 'Familia y tratamientos eliminados correctamente',
      affectedServices: 2
    })
  })

  it('blocks deleting a family with all its services when one of them is used by bono templates', async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: 'service-1' }])
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify([
        {
          id: 'template-1',
          serviceId: 'service-1'
        }
      ])
    })

    const req = createMockRequest({
      body: {
        category: 'Prueba'
      }
    })
    const res = createMockResponse()

    await deleteServiceCategoryWithServices(req as any, res)

    expect(prismaMock.service.deleteMany).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      error: 'No se puede eliminar la familia porque alguno de sus tratamientos está vinculado a bonos del catálogo'
    })
  })
})

describe('service.controller importServicesFromExcel', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('splits service search into token clauses across searchable fields', async () => {
    prismaMock.service.findMany.mockResolvedValue([])

    const req = createMockRequest({
      query: {
        search: 'rad fac',
        isActive: 'true'
      }
    })
    const res = createMockResponse()

    await getServices(req as any, res)

    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          AND: [
            {
              OR: expect.arrayContaining([
                { name: { contains: 'rad' } },
                { serviceCode: { contains: 'rad' } },
                { category: { contains: 'rad' } }
              ])
            },
            {
              OR: expect.arrayContaining([
                { name: { contains: 'fac' } },
                { serviceCode: { contains: 'fac' } },
                { category: { contains: 'fac' } }
              ])
            }
          ]
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith([])
  })

  it('updates existing services when the Excel uses Tarifa 1', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Limpieza facial',
        category: 'Faciales',
        serviceCode: 'LIMP-FAC'
      }
    ])
    prismaMock.service.update.mockResolvedValue({})

    const buffer = await createWorkbookBuffer([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1', 'IVA', 'Tiempo'],
      ['Faciales', 'LIMP-FAC', 'Limpieza facial', '34,95', '21', "60'"]
    ], 'Tratamientos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importServicesFromExcel(req as any, res)

    expect(prismaMock.service.create).not.toHaveBeenCalled()
    expect(prismaMock.service.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.service.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'service-1' },
        data: expect.objectContaining({
          name: 'Limpieza facial',
          serviceCode: 'LIMP-FAC',
          category: 'Faciales',
          price: 34.95,
          duration: 60,
          taxRate: 21
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          created: 0,
          updated: 1,
          skipped: 0
        })
      })
    )
  })

  it('does not clear the existing code when the imported row has no code', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Limpieza facial',
        category: 'Faciales',
        serviceCode: 'LIMP-FAC'
      }
    ])
    prismaMock.service.update.mockResolvedValue({})

    const buffer = await createWorkbookBuffer([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1', 'IVA', 'Tiempo'],
      ['Faciales', '', 'Limpieza facial', '39,95', '21', "75'"]
    ], 'Tratamientos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importServicesFromExcel(req as any, res)

    expect(prismaMock.service.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'service-1' },
        data: expect.not.objectContaining({
          serviceCode: expect.anything(),
          description: expect.anything()
        })
      })
    )
  })

  it('skips duplicate rows within the same Excel import', async () => {
    prismaMock.service.findMany.mockResolvedValue([])
    prismaMock.service.create.mockResolvedValue({
      id: 'service-1'
    })

    const buffer = await createWorkbookBuffer([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1', 'IVA', 'Tiempo'],
      ['Faciales', 'LIMP-FAC', 'Limpieza facial', '34,95', '21', "60'"],
      ['Faciales', 'LIMP-FAC', 'Limpieza facial', '34,95', '21', "60'"]
    ], 'Tratamientos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importServicesFromExcel(req as any, res)

    expect(prismaMock.service.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.service.update).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 1,
          created: 1,
          updated: 0,
          skipped: 1
        })
      })
    )
  })

  it('skips rows when tariff is invalid instead of creating services with price 0', async () => {
    prismaMock.service.findMany.mockResolvedValue([])

    const buffer = await createWorkbookBuffer([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1', 'IVA', 'Tiempo'],
      ['Faciales', 'LIMP-FAC', 'Limpieza facial', 'abc', '21', "60'"]
    ], 'Tratamientos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importServicesFromExcel(req as any, res)

    expect(prismaMock.service.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.service.update).not.toHaveBeenCalled()
    expect(prismaMock.service.create).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.objectContaining({
          success: 0,
          skipped: 1,
          errors: [expect.objectContaining({ error: expect.stringContaining('Tarifa inválida o ausente') })]
        })
      })
    )
  })
})
