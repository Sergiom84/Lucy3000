import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAgendaDayNote,
  deleteAgendaDayNote,
  getAgendaDayNotes,
  toggleAgendaDayNote,
  updateAgendaDayNote
} from '../../../src/backend/controllers/agendaDayNote.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('agendaDayNote.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('lists agenda day notes ordered by creation time', async () => {
    prismaMock.agendaDayNote.findMany.mockResolvedValue([
      {
        id: 'note-1',
        dayKey: '2026-04-18',
        text: 'Llamar a proveedor',
        isCompleted: false,
        completedAt: null,
        createdAt: new Date('2026-04-18T08:00:00.000Z'),
        updatedAt: new Date('2026-04-18T08:00:00.000Z')
      }
    ])

    const req = createMockRequest({
      query: { dayKey: '2026-04-18' }
    })
    const res = createMockResponse()

    await getAgendaDayNotes(req as any, res)

    expect(prismaMock.agendaDayNote.findMany).toHaveBeenCalledWith({
      where: { dayKey: '2026-04-18' },
      select: expect.any(Object),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'note-1',
          text: 'Llamar a proveedor'
        })
      ])
    )
  })

  it('creates a day note for the selected day', async () => {
    prismaMock.agendaDayNote.create.mockResolvedValue({
      id: 'note-1',
      dayKey: '2026-04-18',
      text: 'Preparar cabina 2',
      isCompleted: false,
      completedAt: null,
      createdAt: new Date('2026-04-18T08:00:00.000Z'),
      updatedAt: new Date('2026-04-18T08:00:00.000Z')
    })

    const req = createMockRequest({
      body: {
        dayKey: '2026-04-18',
        text: 'Preparar cabina 2'
      }
    })
    const res = createMockResponse()

    await createAgendaDayNote(req as any, res)

    expect(prismaMock.agendaDayNote.create).toHaveBeenCalledWith({
      data: {
        dayKey: '2026-04-18',
        text: 'Preparar cabina 2'
      },
      select: expect.any(Object)
    })
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('toggles completion and persists completedAt', async () => {
    prismaMock.agendaDayNote.findUnique.mockResolvedValue({ id: 'note-1' })
    prismaMock.agendaDayNote.update.mockResolvedValue({
      id: 'note-1',
      dayKey: '2026-04-18',
      text: 'Cerrar caja',
      isCompleted: true,
      completedAt: new Date('2026-04-18T11:30:00.000Z'),
      createdAt: new Date('2026-04-18T08:00:00.000Z'),
      updatedAt: new Date('2026-04-18T11:30:00.000Z')
    })

    const req = createMockRequest({
      params: { id: 'note-1' },
      body: { isCompleted: true }
    })
    const res = createMockResponse()

    await toggleAgendaDayNote(req as any, res)

    expect(prismaMock.agendaDayNote.update).toHaveBeenCalledWith({
      where: { id: 'note-1' },
      data: {
        isCompleted: true,
        completedAt: expect.any(Date)
      },
      select: expect.any(Object)
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'note-1',
        isCompleted: true
      })
    )
  })

  it('updates and deletes an existing day note', async () => {
    prismaMock.agendaDayNote.findUnique.mockResolvedValue({ id: 'note-1' })
    prismaMock.agendaDayNote.update.mockResolvedValue({
      id: 'note-1',
      dayKey: '2026-04-18',
      text: 'Texto corregido',
      isCompleted: false,
      completedAt: null,
      createdAt: new Date('2026-04-18T08:00:00.000Z'),
      updatedAt: new Date('2026-04-18T11:45:00.000Z')
    })

    const updateReq = createMockRequest({
      params: { id: 'note-1' },
      body: { text: 'Texto corregido' }
    })
    const updateRes = createMockResponse()

    await updateAgendaDayNote(updateReq as any, updateRes)

    expect(prismaMock.agendaDayNote.update).toHaveBeenCalledWith({
      where: { id: 'note-1' },
      data: {
        text: 'Texto corregido'
      },
      select: expect.any(Object)
    })

    prismaMock.agendaDayNote.delete.mockResolvedValue(undefined)

    const deleteReq = createMockRequest({
      params: { id: 'note-1' }
    })
    const deleteRes = createMockResponse()

    await deleteAgendaDayNote(deleteReq as any, deleteRes)

    expect(prismaMock.agendaDayNote.delete).toHaveBeenCalledWith({
      where: { id: 'note-1' }
    })
    expect(deleteRes.json).toHaveBeenCalledWith({ message: 'Agenda day note deleted successfully' })
  })
})
