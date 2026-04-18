import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAppointmentLegend,
  deleteAppointmentLegend,
  getAppointmentLegendCategories,
  getAppointmentLegends
} from '../../../src/backend/controllers/appointment.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('appointment.legend.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('lists appointment legends ordered from prisma', async () => {
    prismaMock.appointmentLegend.findMany.mockResolvedValue([
      { id: 'legend-1', name: 'Facial', color: '#15803D', sortOrder: 0 }
    ])

    const req = createMockRequest()
    const res = createMockResponse()

    await getAppointmentLegends(req as any, res)

    expect(prismaMock.appointmentLegend.findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })
    expect(res.json).toHaveBeenCalledWith([
      { id: 'legend-1', category: 'Facial', color: '#15803D', sortOrder: 0 }
    ])
  })

  it('lists unique legend categories from treatments', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { category: 'Facial' },
      { category: 'Corporal' },
      { category: 'Facial' },
      { category: ' ' },
      { category: 'Micropigmentacion' }
    ])

    const req = createMockRequest()
    const res = createMockResponse()

    await getAppointmentLegendCategories(req as any, res)

    expect(res.json).toHaveBeenCalledWith(['Corporal', 'Facial', 'Micropigmentacion'])
  })

  it('creates a new appointment legend for an existing treatment category', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { category: 'Facial' },
      { category: 'Corporal' },
      { category: 'Micropigmentacion' }
    ])
    prismaMock.appointmentLegend.findMany.mockResolvedValue([
      { id: 'legend-1', name: 'Facial', sortOrder: 0 },
      { id: 'legend-2', name: 'Corporal', sortOrder: 4 }
    ])
    prismaMock.appointmentLegend.create.mockResolvedValue({
      id: 'legend-3',
      name: 'Micropigmentacion',
      color: '#C026D3',
      sortOrder: 5
    })

    const req = createMockRequest({
      body: {
        category: 'Micropigmentacion',
        color: '#c026d3'
      }
    })
    const res = createMockResponse()

    await createAppointmentLegend(req as any, res)

    expect(prismaMock.appointmentLegend.create).toHaveBeenCalledWith({
      data: {
        name: 'Micropigmentacion',
        color: '#C026D3',
        sortOrder: 5
      }
    })
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      id: 'legend-3',
      category: 'Micropigmentacion',
      color: '#C026D3',
      sortOrder: 5
    })
  })

  it('rejects duplicate appointment legend categories ignoring accents and case', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { category: 'Micropigmentacion' }
    ])
    prismaMock.appointmentLegend.findMany.mockResolvedValue([
      { id: 'legend-1', name: 'Micropigmentación', sortOrder: 0 }
    ])

    const req = createMockRequest({
      body: {
        category: 'micropigmentacion',
        color: '#C026D3'
      }
    })
    const res = createMockResponse()

    await createAppointmentLegend(req as any, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ error: 'Ya existe una leyenda para esa categoría' })
    expect(prismaMock.appointmentLegend.create).not.toHaveBeenCalled()
  })

  it('deletes an existing appointment legend', async () => {
    prismaMock.appointmentLegend.findUnique.mockResolvedValue({
      id: 'legend-1',
      name: 'Facial',
      color: '#15803D',
      sortOrder: 0
    })
    prismaMock.appointmentLegend.delete.mockResolvedValue(undefined)

    const req = createMockRequest({
      params: { id: 'legend-1' }
    })
    const res = createMockResponse()

    await deleteAppointmentLegend(req as any, res)

    expect(prismaMock.appointmentLegend.delete).toHaveBeenCalledWith({
      where: { id: 'legend-1' }
    })
    expect(res.json).toHaveBeenCalledWith({
      message: 'Leyenda eliminada correctamente'
    })
  })
})
