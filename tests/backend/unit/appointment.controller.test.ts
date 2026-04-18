import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAppointment,
  deleteAppointment,
  exportAppointments,
  importAppointmentsFromExcel,
  updateAppointment
} from '../../../src/backend/controllers/appointment.controller'
import { createMockRequest, createMockResponse } from '../helpers/http'
import { createWorkbookBuffer } from '../helpers/spreadsheet'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('appointment.controller', () => {
  beforeEach(() => {
    resetPrismaMock()
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
      date: new Date('2026-03-07T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '10:30',
      status: 'CANCELLED',
      notes: null,
      client: { firstName: 'Ana', lastName: 'Lopez', phone: '600000000', email: 'ana@example.com' },
      user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
      service: { id: 'service-1', name: 'Limpieza facial' },
      sale: null,
      googleCalendarEventId: null
    }

    prismaMock.appointment.update
      .mockResolvedValueOnce(updatedAppointment)
      .mockResolvedValueOnce({
        ...updatedAppointment,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null
      })
    prismaMock.bonoSession.updateMany.mockResolvedValue({ count: 1 })

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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'appointment-1',
        status: 'CANCELLED'
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
