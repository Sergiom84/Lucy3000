import { beforeEach, describe, expect, it, vi } from 'vitest'
const { buildInclusiveDateRangeMock } = vi.hoisted(() => ({
  buildInclusiveDateRangeMock: vi.fn()
}))

vi.mock('../../../src/backend/utils/date-range', () => ({
  buildInclusiveDateRange: buildInclusiveDateRangeMock
}))

import {
  createAppointment,
  chargeAppointmentWithBono,
  deleteAppointment,
  exportAppointments,
  getAppointmentsByDate,
  importAppointmentsFromExcel,
  updateAppointment
} from '../../../src/backend/controllers/appointment.controller'
import { googleCalendarService } from '../../../src/backend/services/googleCalendar.service'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { createWorkbookBuffer } from '../helpers/spreadsheet'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('appointment.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
    buildInclusiveDateRangeMock.mockReset()
    prismaMock.agendaBlock.findMany.mockResolvedValue([])
    prismaMock.setting.findUnique.mockResolvedValue(null)
    prismaMock.sale.findMany.mockResolvedValue([])
    prismaMock.quote.findMany.mockResolvedValue([])
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Lucy' })
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Limpieza facial',
        duration: 30,
        category: 'Facial',
        serviceCode: 'FAC-01'
      }
    ])
  })

  it('uses the local inclusive day range when fetching appointments by date', async () => {
    const dateRange = {
      gte: new Date('2099-06-14T22:00:00.000Z'),
      lte: new Date('2099-06-15T21:59:59.999Z')
    }
    buildInclusiveDateRangeMock.mockReturnValue(dateRange)
    prismaMock.appointment.findMany.mockResolvedValue([])

    const req = createMockRequest({
      params: { date: '2099-06-15' }
    })
    const res = createMockResponse()

    await getAppointmentsByDate(req as any, res)

    expect(buildInclusiveDateRangeMock).toHaveBeenCalledWith('2099-06-15', '2099-06-15')
    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: dateRange
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith([])
  })

  it('creates appointment with cabin and reminder notification', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.create.mockResolvedValue({
      id: 'appointment-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-06-15T10:00:00.000Z'),
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      service: { name: 'Limpieza facial' },
      googleCalendarEventId: null
    })
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-06-15T10:00:00.000Z'),
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
        professional: 'Lucy',
        date: '2099-06-15T10:00:00.000Z',
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

  it('creates guest appointment and uses guest name in notification', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.create.mockResolvedValue({
      id: 'appointment-guest-1',
      clientId: null,
      guestName: 'Cliente puntual',
      guestPhone: '600123123',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-06-15T10:00:00.000Z'),
      client: null,
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { name: 'Limpieza facial' },
      googleCalendarEventId: null
    })
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-guest-1',
      clientId: null,
      guestName: 'Cliente puntual',
      guestPhone: '600123123',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-06-15T10:00:00.000Z'),
      client: null,
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { name: 'Limpieza facial' },
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null,
      sale: null
    })
    prismaMock.notification.create.mockResolvedValue(undefined)

    const req = createMockRequest({
      body: {
        clientId: null,
        guestName: 'Cliente puntual',
        guestPhone: '600123123',
        userId: 'user-1',
        serviceId: 'service-1',
        cabin: 'LUCY',
        professional: 'Lucy',
        date: '2099-06-15T10:00:00.000Z',
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
          clientId: null,
          guestName: 'Cliente puntual',
          guestPhone: '600123123'
        })
      })
    )
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining('Cliente puntual')
        })
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('creates appointment with multiple services and recalculates end time', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Limpieza facial',
        duration: 30,
        category: 'Facial',
        serviceCode: 'FAC-01'
      },
      {
        id: 'service-2',
        name: 'Masaje cervical',
        duration: 45,
        category: 'Corporal',
        serviceCode: 'COR-02'
      }
    ])
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.create.mockResolvedValue({
      id: 'appointment-multi-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-06-15T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:15',
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      appointmentServices: [
        { serviceId: 'service-1', sortOrder: 0, service: { id: 'service-1', name: 'Limpieza facial' } },
        { serviceId: 'service-2', sortOrder: 1, service: { id: 'service-2', name: 'Masaje cervical' } }
      ],
      googleCalendarEventId: null,
      sale: null
    })
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-multi-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-06-15T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:15',
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      appointmentServices: [
        { serviceId: 'service-1', sortOrder: 0, service: { id: 'service-1', name: 'Limpieza facial' } },
        { serviceId: 'service-2', sortOrder: 1, service: { id: 'service-2', name: 'Masaje cervical' } }
      ],
      googleCalendarEventId: null,
      googleCalendarSyncStatus: 'DISABLED',
      googleCalendarSyncError: null,
      sale: null
    })
    prismaMock.notification.create.mockResolvedValue(undefined)

    const req = createMockRequest({
      body: {
        clientId: 'client-1',
        userId: 'user-1',
        serviceId: 'service-1',
        serviceIds: ['service-1', 'service-2'],
        cabin: 'LUCY',
        professional: 'Lucy',
        date: '2099-06-15T10:00:00.000Z',
        startTime: '10:00',
        endTime: '10:15',
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
          serviceId: 'service-1',
          endTime: '11:15',
          appointmentServices: {
            create: [
              { serviceId: 'service-1', sortOrder: 0 },
              { serviceId: 'service-2', sortOrder: 1 }
            ]
          }
        })
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects appointment creation when the slot is blocked by an agenda block', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prismaMock.agendaBlock.findMany
      .mockResolvedValueOnce([{ startTime: '10:15', endTime: '10:45' }])
      .mockResolvedValueOnce([])

    const req = createMockRequest({
      body: {
        clientId: 'client-1',
        userId: 'user-1',
        serviceId: 'service-1',
        cabin: 'LUCY',
        professional: 'Lucy',
        date: '2099-06-15T10:00:00.000Z',
        startTime: '10:30',
        endTime: '11:00',
        status: 'SCHEDULED',
        notes: null,
        reminder: true
      }
    })
    const res = createMockResponse()

    await createAppointment(req as any, res)

    expect(prismaMock.appointment.create).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('bloqueo'),
        code: 'PROFESSIONAL_CONFLICT'
      })
    )
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

  it('charges an appointment with a compatible bono and records the client history', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      clientId: 'client-1',
      status: 'SCHEDULED',
      sale: null,
      bonoSessions: [],
      client: { firstName: 'Norma', lastName: 'Gonzalo Delgado' },
      serviceId: 'service-1',
      service: { id: 'service-1', name: 'Rollaction' },
      appointmentServices: [
        {
          serviceId: 'service-1',
          sortOrder: 0,
          service: { id: 'service-1', name: 'Rollaction' }
        }
      ]
    })
    prismaMock.bonoPack.findMany.mockResolvedValue([
      {
        id: 'bono-pack-1',
        name: 'Rollaction · 20 sesiones',
        status: 'ACTIVE',
        purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
        service: { id: 'service-1', name: 'Rollaction' },
        sessions: [
          { id: 'session-1', sessionNumber: 8, status: 'AVAILABLE', appointmentId: null },
          { id: 'session-2', sessionNumber: 9, status: 'AVAILABLE', appointmentId: null }
        ]
      }
    ])

    const tx = {
      bonoSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      bonoPack: {
        update: vi.fn()
      },
      notification: {
        create: vi.fn()
      },
      appointment: {
        update: vi.fn().mockResolvedValue({ id: 'appointment-1', status: 'COMPLETED' }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'appointment-1',
          status: 'COMPLETED',
          bonoSessions: [
            {
              id: 'session-1',
              status: 'CONSUMED',
              sessionNumber: 8,
              bonoPack: {
                id: 'bono-pack-1',
                name: 'Rollaction · 20 sesiones'
              }
            }
          ]
        })
      },
      clientHistory: {
        create: vi.fn().mockResolvedValue({ id: 'history-1' })
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: 'appointment-1' },
      body: {
        bonoPackId: 'bono-pack-1'
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await chargeAppointmentWithBono(req as any, res)

    expect(prismaMock.bonoPack.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId: 'client-1',
          status: 'ACTIVE'
        }
      })
    )
    expect(tx.bonoSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: 'AVAILABLE',
        appointmentId: null
      },
      data: {
        appointmentId: 'appointment-1',
        status: 'CONSUMED',
        consumedAt: expect.any(Date)
      }
    })
    expect(tx.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: {
        status: 'COMPLETED'
      }
    })
    expect(tx.clientHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client-1',
        service: 'Rollaction',
        amount: 0,
        notes: 'Sesion descontada del bono "Rollaction · 20 sesiones"'
      })
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'appointment-1',
        status: 'COMPLETED',
        bonoSessions: [expect.objectContaining({ status: 'CONSUMED' })],
        bonoChargeSummary: expect.objectContaining({
          sessionsConsumed: 1
        })
      })
    )
    expect(tx.bonoPack.update).not.toHaveBeenCalled()
    expect(tx.notification.create).not.toHaveBeenCalled()
  })

  it('charges an appointment when the bono matches the same treatment family with different minutes', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([
        {
          id: 'template-20',
          category: 'DEP. ELECTRICA',
          description: 'Bono de 12 sesiones',
          serviceId: 'service-60',
          serviceName: 'Dep. electrica 60 min',
          serviceLookup: 'DEEL',
          totalSessions: 12,
          price: 360,
          isActive: true,
          createdAt: '2026-04-21T00:00:00.000Z'
        }
      ])
    })
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-20',
      clientId: 'client-1',
      status: 'SCHEDULED',
      sale: null,
      bonoSessions: [],
      client: { firstName: 'Maria', lastName: 'Gutierrez Marina' },
      serviceId: 'service-20',
      service: { id: 'service-20', name: 'Dep. electrica 20 min' },
      appointmentServices: [
        {
          serviceId: 'service-20',
          sortOrder: 0,
          service: { id: 'service-20', name: 'Dep. electrica 20 min' }
        }
      ]
    })
    prismaMock.bonoPack.findMany.mockResolvedValue([
      {
        id: 'bono-pack-20',
        name: 'Dep. electrica 60 min · 12 sesiones',
        status: 'ACTIVE',
        purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
        serviceId: 'service-60',
        service: { id: 'service-60', name: 'Dep. electrica 60 min' },
        sessions: [{ id: 'session-20', sessionNumber: 7, status: 'AVAILABLE', appointmentId: null }]
      }
    ])

    const tx = {
      bonoSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      bonoPack: {
        update: vi.fn()
      },
      notification: {
        create: vi.fn()
      },
      appointment: {
        update: vi.fn().mockResolvedValue({ id: 'appointment-20', status: 'COMPLETED' }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'appointment-20',
          status: 'COMPLETED',
          bonoSessions: [
            {
              id: 'session-20',
              status: 'CONSUMED',
              sessionNumber: 7,
              bonoPack: {
                id: 'bono-pack-20',
                name: 'Dep. electrica 60 min · 12 sesiones'
              }
            }
          ]
        })
      },
      clientHistory: {
        create: vi.fn().mockResolvedValue({ id: 'history-20' })
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: 'appointment-20' },
      body: {
        bonoPackId: 'bono-pack-20'
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await chargeAppointmentWithBono(req as any, res)

    expect(tx.bonoSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-20',
        status: 'AVAILABLE',
        appointmentId: null
      },
      data: {
        appointmentId: 'appointment-20',
        status: 'CONSUMED',
        consumedAt: expect.any(Date)
      }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'appointment-20',
        status: 'COMPLETED'
      })
    )
  })

  it('charges multiple bono sessions for the same appointment when requested', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-multi-1',
      clientId: 'client-1',
      status: 'SCHEDULED',
      sale: null,
      bonoSessions: [],
      client: { firstName: 'Norma', lastName: 'Gonzalo Delgado' },
      serviceId: 'service-1',
      service: { id: 'service-1', name: 'Rollaction' },
      appointmentServices: [
        {
          serviceId: 'service-1',
          sortOrder: 0,
          service: { id: 'service-1', name: 'Rollaction' }
        }
      ]
    })
    prismaMock.bonoPack.findMany.mockResolvedValue([
      {
        id: 'bono-pack-1',
        name: 'Rollaction · 20 sesiones',
        status: 'ACTIVE',
        purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
        service: { id: 'service-1', name: 'Rollaction' },
        sessions: [
          { id: 'session-11', sessionNumber: 11, status: 'AVAILABLE', appointmentId: null },
          { id: 'session-12', sessionNumber: 12, status: 'AVAILABLE', appointmentId: null },
          { id: 'session-13', sessionNumber: 13, status: 'AVAILABLE', appointmentId: null }
        ]
      }
    ])

    const tx = {
      bonoSession: {
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 })
      },
      bonoPack: {
        update: vi.fn()
      },
      notification: {
        create: vi.fn()
      },
      appointment: {
        update: vi.fn().mockResolvedValue({ id: 'appointment-multi-1', status: 'COMPLETED' }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'appointment-multi-1',
          status: 'COMPLETED',
          bonoSessions: [
            {
              id: 'session-11',
              status: 'CONSUMED',
              sessionNumber: 11,
              bonoPack: { id: 'bono-pack-1', name: 'Rollaction · 20 sesiones' }
            },
            {
              id: 'session-12',
              status: 'CONSUMED',
              sessionNumber: 12,
              bonoPack: { id: 'bono-pack-1', name: 'Rollaction · 20 sesiones' }
            }
          ]
        })
      },
      clientHistory: {
        create: vi.fn().mockResolvedValue({ id: 'history-multi-1' })
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: 'appointment-multi-1' },
      body: {
        bonoPackId: 'bono-pack-1',
        sessionsToConsume: 2
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await chargeAppointmentWithBono(req as any, res)

    expect(tx.bonoSession.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'session-11',
        status: 'AVAILABLE',
        appointmentId: null
      },
      data: {
        appointmentId: 'appointment-multi-1',
        status: 'CONSUMED',
        consumedAt: expect.any(Date)
      }
    })
    expect(tx.bonoSession.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'session-12',
        status: 'AVAILABLE',
        appointmentId: null
      },
      data: {
        appointmentId: 'appointment-multi-1',
        status: 'CONSUMED',
        consumedAt: expect.any(Date)
      }
    })
    expect(tx.clientHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client-1',
        notes: '2 sesiones descontadas del bono "Rollaction · 20 sesiones"'
      })
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'appointment-multi-1',
        bonoChargeSummary: expect.objectContaining({
          sessionsConsumed: 2,
          sessionNumbers: [11, 12]
        })
      })
    )
  })

  it('charges an appointment using the linked bono template even when the pack has no direct serviceId', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({
      key: 'bono_templates_catalog',
      value: JSON.stringify([
        {
          id: 'template-antiacne-6',
          category: 'Facial',
          description: 'Bono de 6 sesiones',
          serviceId: 'service-antiacne',
          serviceName: 'Antiacne',
          serviceLookup: 'ANTI',
          totalSessions: 6,
          price: 199,
          isActive: true,
          createdAt: '2026-04-21T00:00:00.000Z'
        }
      ])
    })
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-antiacne-1',
      clientId: 'client-1',
      status: 'SCHEDULED',
      sale: null,
      bonoSessions: [],
      client: { firstName: 'Sergio', lastName: 'Hernandez Lara' },
      serviceId: 'service-antiacne',
      service: { id: 'service-antiacne', name: 'Antiacne', category: 'Facial', serviceCode: 'ANTI' },
      appointmentServices: [
        {
          serviceId: 'service-antiacne',
          sortOrder: 0,
          service: { id: 'service-antiacne', name: 'Antiacne', category: 'Facial', serviceCode: 'ANTI' }
        }
      ]
    })
    prismaMock.bonoPack.findMany.mockResolvedValue([
      {
        id: 'bono-pack-antiacne',
        name: 'Bono de 6 sesiones',
        bonoTemplateId: 'template-antiacne-6',
        status: 'ACTIVE',
        purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
        serviceId: null,
        service: null,
        sessions: [
          { id: 'session-antiacne', sessionNumber: 2, status: 'AVAILABLE', appointmentId: null }
        ]
      }
    ])

    const tx = {
      bonoSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      bonoPack: {
        update: vi.fn()
      },
      notification: {
        create: vi.fn()
      },
      appointment: {
        update: vi.fn().mockResolvedValue({ id: 'appointment-antiacne-1', status: 'COMPLETED' }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'appointment-antiacne-1',
          status: 'COMPLETED',
          bonoSessions: [
            {
              id: 'session-antiacne',
              status: 'CONSUMED',
              sessionNumber: 2,
              bonoPack: {
                id: 'bono-pack-antiacne',
                name: 'Bono de 6 sesiones'
              }
            }
          ]
        })
      },
      clientHistory: {
        create: vi.fn().mockResolvedValue({ id: 'history-antiacne' })
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const req = createMockRequest({
      params: { id: 'appointment-antiacne-1' },
      body: {
        bonoPackId: 'bono-pack-antiacne'
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await chargeAppointmentWithBono(req as any, res)

    expect(tx.bonoSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-antiacne',
        status: 'AVAILABLE',
        appointmentId: null
      },
      data: {
        appointmentId: 'appointment-antiacne-1',
        status: 'CONSUMED',
        consumedAt: expect.any(Date)
      }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'appointment-antiacne-1',
        status: 'COMPLETED'
      })
    )
  })

  it('does not charge a mixed-service appointment when one selected service is unrelated to the bono', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-mixed-1',
      clientId: 'client-1',
      status: 'SCHEDULED',
      sale: null,
      bonoSessions: [],
      client: { firstName: 'Sergio', lastName: 'Hernandez Lara' },
      serviceId: 'service-rollaction',
      service: { id: 'service-rollaction', name: 'Rollaction', category: 'Corporal', serviceCode: 'ROLL' },
      appointmentServices: [
        {
          serviceId: 'service-rollaction',
          sortOrder: 0,
          service: { id: 'service-rollaction', name: 'Rollaction', category: 'Corporal', serviceCode: 'ROLL' }
        },
        {
          serviceId: 'service-antiacne',
          sortOrder: 1,
          service: { id: 'service-antiacne', name: 'Antiacne', category: 'Facial', serviceCode: 'ANTI' }
        }
      ]
    })
    prismaMock.bonoPack.findMany.mockResolvedValue([
      {
        id: 'bono-pack-rollaction',
        name: 'Rollaction · 20 sesiones',
        status: 'ACTIVE',
        purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
        serviceId: 'service-rollaction',
        service: {
          id: 'service-rollaction',
          name: 'Rollaction',
          category: 'Corporal',
          serviceCode: 'ROLL'
        },
        sessions: [{ id: 'session-rollaction', sessionNumber: 4, status: 'AVAILABLE', appointmentId: null }]
      }
    ])

    const req = createMockRequest({
      params: { id: 'appointment-mixed-1' },
      body: {
        bonoPackId: 'bono-pack-rollaction'
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await chargeAppointmentWithBono(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'No hay bonos activos compatibles para esta cita'
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('requests bono selection when an appointment has multiple compatible bonos', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      clientId: 'client-1',
      status: 'SCHEDULED',
      sale: null,
      bonoSessions: [],
      client: { firstName: 'Norma', lastName: 'Gonzalo Delgado' },
      serviceId: 'service-1',
      service: { id: 'service-1', name: 'Rollaction' },
      appointmentServices: [
        {
          serviceId: 'service-1',
          sortOrder: 0,
          service: { id: 'service-1', name: 'Rollaction' }
        }
      ]
    })
    prismaMock.bonoPack.findMany.mockResolvedValue([
      {
        id: 'bono-pack-1',
        name: 'Rollaction mañana',
        status: 'ACTIVE',
        purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
        service: { id: 'service-1', name: 'Rollaction' },
        sessions: [{ id: 'session-1', sessionNumber: 8, status: 'AVAILABLE', appointmentId: null }]
      },
      {
        id: 'bono-pack-2',
        name: 'Rollaction tarde',
        status: 'ACTIVE',
        purchaseDate: new Date('2026-03-01T00:00:00.000Z'),
        service: { id: 'service-1', name: 'Rollaction' },
        sessions: [{ id: 'session-2', sessionNumber: 3, status: 'AVAILABLE', appointmentId: null }]
      }
    ])

    const req = createMockRequest({
      params: { id: 'appointment-1' },
      body: {},
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await chargeAppointmentWithBono(req as any, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('varios bonos compatibles'),
        bonoOptions: [
          expect.objectContaining({
            id: 'bono-pack-1',
            name: 'Rollaction mañana',
            remainingSessions: 1
          }),
          expect.objectContaining({
            id: 'bono-pack-2',
            name: 'Rollaction tarde',
            remainingSessions: 1
          })
        ]
      })
    )
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('prevents deleting an appointment with a consumed bono linked', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      bonoSessions: [{ id: 'session-1', status: 'CONSUMED' }],
      sale: null
    })

    const req = createMockRequest({
      params: { id: 'appointment-1' }
    })
    const res = createMockResponse()

    await deleteAppointment(req as any, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prismaMock.appointment.delete).not.toHaveBeenCalled()
  })

  it('releases reserved bono session when appointment moves to cancelled', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      clientId: 'client-1',
      guestName: null,
      guestPhone: null,
      status: 'SCHEDULED',
      serviceId: 'service-1',
      appointmentServices: [
        {
          serviceId: 'service-1',
          sortOrder: 0,
          service: { id: 'service-1', name: 'Limpieza facial', duration: 30 }
        }
      ]
    })

    const updatedAppointment = {
      id: 'appointment-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2099-03-07T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '10:30',
      status: 'CANCELLED',
      notes: null,
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sale: null,
      googleCalendarEventId: 'event-1'
    }

    prismaMock.appointment.update
      .mockResolvedValueOnce(updatedAppointment)
      .mockResolvedValueOnce({
        ...updatedAppointment,
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null
      })
    prismaMock.bonoSession.updateMany.mockResolvedValue({ count: 1 })
    const deleteCalendarSpy = vi
      .spyOn(googleCalendarService, 'deleteAppointmentEvent')
      .mockResolvedValue({
        eventId: null,
        status: 'DISABLED',
        error: null
      })

    const req = createMockRequest({
      params: { id: 'appointment-1' },
      body: {
        status: 'CANCELLED'
      }
    })
    const res = createMockResponse()

    await updateAppointment(req as any, res)

    expect(prismaMock.bonoSession.updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: 'appointment-1',
        status: 'AVAILABLE'
      },
      data: {
        appointmentId: null
      }
    })
    expect(deleteCalendarSpy).toHaveBeenCalledWith('event-1', 'ana@example.com')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'appointment-1',
        status: 'CANCELLED'
      })
    )
  })

  it('releases reserved bono session when the appointment changes to an incompatible treatment', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      clientId: 'client-1',
      guestName: null,
      guestPhone: null,
      status: 'SCHEDULED',
      date: new Date('2099-03-07T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:00',
      professional: 'Lucy',
      cabin: 'LUCY',
      serviceId: 'service-rollaction',
      bonoSessions: [
        {
          id: 'session-1',
          status: 'AVAILABLE',
          sessionNumber: 3,
          bonoPack: {
            id: 'bono-pack-rollaction',
            name: 'Rollaction · 20 sesiones'
          }
        }
      ],
      service: { id: 'service-rollaction', name: 'Rollaction', category: 'Corporal', serviceCode: 'ROLL' },
      appointmentServices: [
        {
          serviceId: 'service-rollaction',
          sortOrder: 0,
          service: { id: 'service-rollaction', name: 'Rollaction', category: 'Corporal', serviceCode: 'ROLL' }
        }
      ]
    })
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-antiacne',
        name: 'Antiacne',
        duration: 45,
        category: 'Facial',
        serviceCode: 'ANTI'
      }
    ])

    const updatedAppointment = {
      id: 'appointment-1',
      clientId: 'client-1',
      cabin: 'LUCY',
      reminder: true,
      date: new Date('2026-03-07T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '10:45',
      status: 'SCHEDULED',
      notes: null,
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-antiacne', name: 'Antiacne', category: 'Facial', serviceCode: 'ANTI' },
      appointmentServices: [
        {
          serviceId: 'service-antiacne',
          sortOrder: 0,
          service: { id: 'service-antiacne', name: 'Antiacne', category: 'Facial', serviceCode: 'ANTI' }
        }
      ],
      bonoSessions: [
        {
          id: 'session-1',
          status: 'AVAILABLE',
          sessionNumber: 3,
          bonoPack: {
            id: 'bono-pack-rollaction',
            name: 'Rollaction · 20 sesiones'
          }
        }
      ],
      sale: null,
      googleCalendarEventId: null
    }

    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.update
      .mockResolvedValueOnce(updatedAppointment)
      .mockResolvedValueOnce({
        ...updatedAppointment,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null
      })
    prismaMock.bonoPack.findMany.mockResolvedValue([
      {
        id: 'bono-pack-rollaction',
        name: 'Rollaction · 20 sesiones',
        status: 'ACTIVE',
        purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
        serviceId: 'service-rollaction',
        service: {
          id: 'service-rollaction',
          name: 'Rollaction',
          category: 'Corporal',
          serviceCode: 'ROLL'
        },
        sessions: [{ id: 'session-1', sessionNumber: 3, status: 'AVAILABLE', appointmentId: 'appointment-1' }]
      }
    ])
    prismaMock.bonoSession.updateMany.mockResolvedValue({ count: 1 })

    const req = createMockRequest({
      params: { id: 'appointment-1' },
      body: {
        startTime: '10:00',
        serviceId: 'service-antiacne',
        serviceIds: ['service-antiacne']
      }
    })
    const res = createMockResponse()

    await updateAppointment(req as any, res)

    expect(prismaMock.bonoSession.updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: 'appointment-1',
        status: 'AVAILABLE'
      },
      data: {
        appointmentId: null
      }
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'appointment-1',
        service: expect.objectContaining({
          id: 'service-antiacne'
        })
      })
    )
  })

  it('imports appointments from Excel and reports row-level errors without aborting', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'client-1',
        externalCode: '143',
        firstName: 'CLARA',
        lastName: 'RUIZ CALCERRADA',
        phone: '670312806',
        email: 'clara@example.com'
      }
    ])
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        serviceCode: 'SHRMEN',
        name: 'Menton shr',
        duration: 20
      }
    ])
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.create.mockResolvedValue({ id: 'appointment-1' })

    const buffer = await createWorkbookBuffer(
      [
        [
          'Fecha',
          'Hora',
          'Minutos',
          'cliente',
          'Nombre',
          'Código',
          'Descripción',
          'Cabina',
          'Profesional',
          'Teléfono',
          'Mail',
          'Notas'
        ],
        [
          '20-04-26',
          '10:45',
          20,
          143,
          'CLARA RUIZ CALCERRADA',
          'SHRMEN',
          'Menton shr',
          'CABINA',
          'LUCY',
          670312806,
          'clara@example.com',
          'Primera cita'
        ],
        [
          '20-04-26',
          '11:15',
          20,
          143,
          'CLARA RUIZ CALCERRADA',
          '',
          '',
          'CABINA',
          'LUCY',
          670312806,
          'clara@example.com',
          'Sin tratamiento'
        ]
      ],
      'Citas'
    )

    const req = createMockRequest({
      file: { buffer } as any,
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await importAppointmentsFromExcel(req as any, res)

    expect(prismaMock.appointment.create).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          success: 1,
          skipped: 1,
          errors: [
            expect.objectContaining({
              row: 3,
              error: expect.stringContaining('Fila 3')
            })
          ]
        })
      })
    )
  })

  it('imports with client phone fallback and reports agenda blocks with a clearer message', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'client-1',
        externalCode: '2633',
        firstName: 'PATRI',
        lastName: 'JUAREZ JUAREZ',
        fullName: 'PATRI JUAREZ JUAREZ',
        phone: '626141841',
        mobilePhone: '626141841',
        landlinePhone: null,
        email: null
      }
    ])
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        serviceCode: 'EL15',
        name: 'Dep. electrica 15 min',
        duration: 20,
        isActive: true,
        createdAt: new Date('2026-03-30T12:40:37.032Z')
      }
    ])
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.create.mockResolvedValue({ id: 'appointment-1' })

    const buffer = await createWorkbookBuffer(
      [
        [
          'Fecha',
          'Hora',
          'Minutos',
          'cliente',
          'Nombre',
          'Código',
          'Descripción',
          'Cabina',
          'Profesional',
          'Teléfono',
          'Mail',
          'Notas'
        ],
        [
          '21-04-26',
          '10:45',
          20,
          1,
          'PATRICIA JUAREZ',
          'EL15',
          'Dep. electrica 15 min',
          'CABINA',
          'TAMARA',
          626141841,
          '',
          ''
        ],
        [
          '21-04-26',
          '12:00',
          90,
          1,
          'PILATES',
          '',
          '',
          '',
          'TAMARA',
          '',
          '',
          ''
        ]
      ],
      'Citas'
    )

    const req = createMockRequest({
      file: { buffer } as any,
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await importAppointmentsFromExcel(req as any, res)

    expect(prismaMock.appointment.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1'
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          success: 1,
          skipped: 1,
          blocks: [
            expect.objectContaining({
              row: 3,
              error: expect.stringContaining('bloqueo o nota de agenda')
            })
          ]
        })
      })
    )
  })

  it('previews duplicate appointments and clients without ficha before importing', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'client-1',
        externalCode: '143',
        firstName: 'CLARA',
        lastName: 'RUIZ CALCERRADA',
        phone: '670312806',
        email: 'clara@example.com'
      }
    ])
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        serviceCode: 'SHRMEN',
        name: 'Menton shr',
        duration: 20
      }
    ])
    prismaMock.appointment.findMany.mockImplementation(async ({ where }: any) => {
      if (where?.OR) {
        return [
          {
            clientId: 'client-1',
            serviceId: 'service-1',
            date: new Date('2026-04-20T00:00:00.000Z'),
            startTime: '10:45',
            endTime: '11:05',
            professional: 'LUCY',
            cabin: 'CABINA_1'
          }
        ]
      }

      return []
    })

    const buffer = await createWorkbookBuffer(
      [
        [
          'Fecha',
          'Hora',
          'Minutos',
          'cliente',
          'Nombre',
          'Código',
          'Descripción',
          'Cabina',
          'Profesional',
          'Teléfono',
          'Mail',
          'Notas'
        ],
        [
          '20-04-26',
          '10:45',
          20,
          143,
          'CLARA RUIZ CALCERRADA',
          'SHRMEN',
          'Menton shr',
          'CABINA',
          'LUCY',
          670312806,
          'clara@example.com',
          'Duplicada'
        ],
        [
          '20-04-26',
          '11:15',
          20,
          2956,
          'IVONNE',
          'SHRMEN',
          'Menton shr',
          'CABINA',
          'LUCY',
          '600123123',
          '',
          'Sin ficha'
        ]
      ],
      'Citas'
    )

    const req = createMockRequest({
      file: { buffer } as any,
      body: {
        mode: 'preview',
        createMissingClients: false
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await importAppointmentsFromExcel(req as any, res)

    expect(prismaMock.appointment.create).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'preview',
        preview: expect.objectContaining({
          totalRows: 2,
          ready: 0,
          duplicates: [
            expect.objectContaining({
              row: 2,
              message: expect.stringContaining('ya existe en la agenda')
            })
          ],
          missingClients: [
            expect.objectContaining({
              clientCode: '2956',
              clientName: 'IVONNE',
              rows: [3]
            })
          ],
          conflicts: []
        })
      })
    )
  })

  it('previews scheduling conflicts before import commit', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: 'client-1',
        externalCode: '143',
        firstName: 'CLARA',
        lastName: 'RUIZ CALCERRADA',
        phone: '670312806',
        email: 'clara@example.com'
      }
    ])
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        serviceCode: 'ROLL',
        name: 'Rollaction',
        duration: 60
      }
    ])
    prismaMock.appointment.findMany.mockImplementation(async ({ where }: any) => {
      if (where?.OR) {
        return []
      }

      if (where?.professional?.in?.includes('Lucy')) {
        return [{ startTime: '17:00', endTime: '18:00' }]
      }

      if (where?.cabin === 'LUCY') {
        return [{ startTime: '17:00', endTime: '18:00' }]
      }

      return []
    })

    const buffer = await createWorkbookBuffer(
      [
        [
          'Fecha',
          'Hora',
          'Minutos',
          'cliente',
          'Nombre',
          'Código',
          'Descripción',
          'Cabina',
          'Profesional',
          'Teléfono',
          'Mail',
          'Notas'
        ],
        [
          '20-04-26',
          '17:30',
          60,
          143,
          'CLARA RUIZ CALCERRADA',
          'ROLL',
          'Rollaction',
          'LUCY',
          'LUCY',
          670312806,
          'clara@example.com',
          'Choque agenda'
        ]
      ],
      'Citas'
    )

    const req = createMockRequest({
      file: { buffer } as any,
      body: {
        mode: 'preview',
        createMissingClients: false
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await importAppointmentsFromExcel(req as any, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'preview',
        preview: expect.objectContaining({
          ready: 0,
          conflicts: [
            expect.objectContaining({
              row: 2,
              message: expect.stringContaining('Lucy ya tiene una cita')
            })
          ]
        })
      })
    )
  })

  it('creates missing client fichas during commit when the user confirms it', async () => {
    prismaMock.client.findMany.mockResolvedValue([])
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        serviceCode: 'SHRMEN',
        name: 'Menton shr',
        duration: 20
      }
    ])
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.client.create.mockResolvedValue({
      id: 'client-new',
      externalCode: '2956',
      firstName: 'IVONNE',
      lastName: 'SIN_APELLIDOS',
      fullName: 'IVONNE SIN_APELLIDOS',
      phone: '600123123',
      mobilePhone: '600123123',
      landlinePhone: null,
      email: null
    })
    prismaMock.appointment.create.mockResolvedValue({ id: 'appointment-1' })

    const buffer = await createWorkbookBuffer(
      [
        [
          'Fecha',
          'Hora',
          'Minutos',
          'cliente',
          'Nombre',
          'Código',
          'Descripción',
          'Cabina',
          'Profesional',
          'Teléfono',
          'Mail',
          'Notas'
        ],
        [
          '20-04-26',
          '11:15',
          20,
          2956,
          'IVONNE',
          'SHRMEN',
          'Menton shr',
          'CABINA',
          'LUCY',
          '600123123',
          '',
          'Crear ficha'
        ]
      ],
      'Citas'
    )

    const req = createMockRequest({
      file: { buffer } as any,
      body: {
        mode: 'commit',
        createMissingClients: true
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await importAppointmentsFromExcel(req as any, res)

    expect(prismaMock.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalCode: '2956',
          firstName: 'IVONNE',
          lastName: 'SIN_APELLIDOS',
          phone: '600123123'
        })
      })
    )
    expect(prismaMock.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-new',
          serviceId: 'service-1'
        })
      })
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          success: 1,
          skipped: 0,
          createdClients: 1,
          missingClients: [
            expect.objectContaining({
              clientCode: '2956',
              action: 'created'
            })
          ]
        })
      })
    )
  })

  it('skips rows with missing clients when the user chooses not to create fichas', async () => {
    prismaMock.client.findMany.mockResolvedValue([])
    prismaMock.service.findMany.mockResolvedValue([
      {
        id: 'service-1',
        serviceCode: 'SHRMEN',
        name: 'Menton shr',
        duration: 20
      }
    ])
    prismaMock.appointment.findMany.mockResolvedValue([])

    const buffer = await createWorkbookBuffer(
      [
        [
          'Fecha',
          'Hora',
          'Minutos',
          'cliente',
          'Nombre',
          'Código',
          'Descripción',
          'Cabina',
          'Profesional',
          'Teléfono',
          'Mail',
          'Notas'
        ],
        [
          '20-04-26',
          '11:15',
          20,
          2956,
          'IVONNE',
          'SHRMEN',
          'Menton shr',
          'CABINA',
          'LUCY',
          '600123123',
          '',
          'Omitir ficha'
        ]
      ],
      'Citas'
    )

    const req = createMockRequest({
      file: { buffer } as any,
      body: {
        mode: 'commit',
        createMissingClients: false
      },
      user: { id: 'user-1', role: 'ADMIN', email: 'admin@lucy3000.com' }
    })
    const res = createMockResponse()

    await importAppointmentsFromExcel(req as any, res)

    expect(prismaMock.client.create).not.toHaveBeenCalled()
    expect(prismaMock.appointment.create).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'commit',
        results: expect.objectContaining({
          success: 0,
          skipped: 1,
          createdClients: 0,
          missingClients: [
            expect.objectContaining({
              clientCode: '2956',
              action: 'skipped'
            })
          ]
        })
      })
    )
  })

  it('exports appointments to an Excel workbook with the expected headers', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',
        date: new Date('2026-04-20T00:00:00.000Z'),
        startTime: '10:45',
        endTime: '11:05',
        cabin: 'CABINA',
        professional: 'LUCY',
        notes: 'Primera cita',
        client: {
          externalCode: '143',
          firstName: 'CLARA',
          lastName: 'RUIZ CALCERRADA',
          phone: '670312806',
          email: 'clara@example.com'
        },
        service: {
          serviceCode: 'SHRMEN',
          name: 'Menton shr',
          duration: 20
        }
      }
    ])

    const req = createMockRequest({
      query: {}
    })
    const res = createMockResponse() as any
    res.setHeader = vi.fn().mockReturnValue(res)
    res.send = vi.fn().mockReturnValue(res)

    await exportAppointments(req as any, res)

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="appointments.xlsx"'
    )
    expect(res.send).toHaveBeenCalledTimes(1)
    const buffer = res.send.mock.calls[0][0] as Buffer
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })
})
