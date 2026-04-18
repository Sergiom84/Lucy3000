import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServices, importServicesFromExcel } from '../../../src/backend/controllers/service.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'
import { createWorkbookBuffer } from '../helpers/spreadsheet'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

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
      { id: 'service-1' },
      { id: 'service-2' }
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
    expect(prismaMock.service.update).toHaveBeenCalledTimes(2)
    expect(prismaMock.service.update).toHaveBeenNthCalledWith(
      1,
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
          skipped: 0
        })
      })
    )
  })

  it('skips rows when tariff is invalid instead of creating services with price 0', async () => {
    const buffer = await createWorkbookBuffer([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1', 'IVA', 'Tiempo'],
      ['Faciales', 'LIMP-FAC', 'Limpieza facial', 'abc', '21', "60'"]
    ], 'Tratamientos')

    const req = createMockRequest({
      file: { buffer } as any
    })
    const res = createMockResponse()

    await importServicesFromExcel(req as any, res)

    expect(prismaMock.service.findMany).not.toHaveBeenCalled()
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
