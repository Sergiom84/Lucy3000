import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { importServicesFromExcel } from '../../../src/backend/controllers/service.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('service.controller importServicesFromExcel', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('updates existing services when the Excel uses Tarifa 1', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: 'service-1' },
      { id: 'service-2' }
    ])
    prismaMock.service.update.mockResolvedValue({})

    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1', 'IVA', 'Tiempo'],
      ['Faciales', 'LIMP-FAC', 'Limpieza facial', '34,95', '21', "60'"]
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tratamientos')
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

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
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Categoria', 'Codigo', 'Descripcion', 'Tarifa 1', 'IVA', 'Tiempo'],
      ['Faciales', 'LIMP-FAC', 'Limpieza facial', 'abc', '21', "60'"]
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tratamientos')
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

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
