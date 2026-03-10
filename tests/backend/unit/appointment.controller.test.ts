import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAppointment,
  deleteAppointment
} from '../../../src/backend/controllers/appointment.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('appointment.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('creates appointment with cabin and reminder notification', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue({
      id: 'appointment-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2026-03-07T10:00:00.000Z'),
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      service: { name: 'Limpieza facial' },
      googleCalendarEventId: null
    })
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2026-03-07T10:00:00.000Z'),
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      service: { name: 'Limpieza facial' },
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null,
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      sale: null
    })
    prismaMock.notification.create.mockResolvedValue(undefined)

    const req = createMockRequest({
      body: {
        clientId: 'client-1',
        userId: 'user-1',
        serviceId: 'service-1',
        cabin: 'LUCY',
        date: '2026-03-07T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        notes: null,
        reminder: true
      }
    })
    const res = createMockResponse()

    await createAppointment(req as any, res)

    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cabin: 'LUCY'
        })
      })
    )
    expect(prismaMock.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'appointment-1' }
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('prevents deleting appointment with a completed sale linked', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      sale: { id: 'sale-1', status: 'COMPLETED' }
    })

    const req = createMockRequest({
      params: { id: 'appointment-1' }
    })
    const res = createMockResponse()

    await deleteAppointment(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prismaMock.appointment.delete).not.toHaveBeenCalled()
  })
})
