import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAgendaBlock,
  deleteAgendaBlock,
  getAgendaBlockProfessionals
} from '../../../src/backend/controllers/agendaBlock.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('agendaBlock.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.agendaBlock.findMany.mockResolvedValue([])
    prismaMock.setting.findUnique.mockResolvedValue(null)
    prismaMock.sale.findMany.mockResolvedValue([])
    prismaMock.quote.findMany.mockResolvedValue([])
  })

  it('returns configured professional names without duplicates', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      value: JSON.stringify(['Tamara', 'Lucy', 'Tamara', '  '])
    })

    const req = createMockRequest()
    const res = createMockResponse()

    await getAgendaBlockProfessionals(req as any, res)

    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining(['Lucy', 'Tamara']))
    expect(res.json).toHaveBeenCalledWith(expect.not.arrayContaining(['']))
  })

  it('creates an agenda block and persists the calendar sync status', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.agendaBlock.create.mockResolvedValue({
      id: 'block-1',
      professional: 'Tamara',
      calendarInviteEmail: 'tamara@example.com',
      cabin: 'CABINA_1',
      date: new Date('2099-06-15T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '12:00',
      notes: 'Formacion interna',
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null,
      googleCalendarSyncedAt: null,
      createdAt: new Date('2099-06-01T00:00:00.000Z'),
      updatedAt: new Date('2099-06-01T00:00:00.000Z')
    })
    prismaMock.agendaBlock.update.mockResolvedValue({
      id: 'block-1',
      professional: 'Tamara',
      calendarInviteEmail: 'tamara@example.com',
      cabin: 'CABINA_1',
      date: new Date('2099-06-15T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '12:00',
      notes: 'Formacion interna',
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null,
      googleCalendarSyncedAt: null,
      createdAt: new Date('2099-06-01T00:00:00.000Z'),
      updatedAt: new Date('2099-06-01T00:00:00.000Z')
    })

    const req = createMockRequest({
      body: {
        professional: 'Tamara',
        calendarInviteEmail: 'tamara@example.com',
        cabin: 'CABINA_1',
        date: '2099-06-15T00:00:00.000Z',
        startTime: '10:00',
        endTime: '12:00',
        notes: 'Formacion interna'
      }
    })
    const res = createMockResponse()

    await createAgendaBlock(req as any, res)

    expect(prismaMock.agendaBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          professional: 'Tamara',
          calendarInviteEmail: 'tamara@example.com',
          cabin: 'CABINA_1',
          startTime: '10:00',
          endTime: '12:00'
        })
      })
    )
    expect(prismaMock.agendaBlock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'block-1' }
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('deletes an agenda block and clears its calendar event', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.agendaBlock.findUnique.mockResolvedValue({
      id: 'block-1',
      professional: 'Tamara',
      calendarInviteEmail: 'tamara@example.com',
      cabin: 'CABINA_1',
      date: new Date('2099-06-15T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '12:00',
      notes: 'Formacion interna',
      googleCalendarEventId: 'event-1',
      googleCalendarSyncStatus: 'SYNCED',
      googleCalendarSyncError: null,
      googleCalendarSyncedAt: new Date('2099-06-01T00:00:00.000Z'),
      createdAt: new Date('2099-06-01T00:00:00.000Z'),
      updatedAt: new Date('2099-06-01T00:00:00.000Z')
    })
    prismaMock.agendaBlock.delete.mockResolvedValue(undefined)

    const req = createMockRequest({
      params: { id: 'block-1' }
    })
    const res = createMockResponse()

    await deleteAgendaBlock(req as any, res)

    expect(prismaMock.agendaBlock.delete).toHaveBeenCalledWith({
      where: { id: 'block-1' }
    })
    expect(res.json).toHaveBeenCalledWith({ message: 'Agenda block deleted successfully' })
  })
})
