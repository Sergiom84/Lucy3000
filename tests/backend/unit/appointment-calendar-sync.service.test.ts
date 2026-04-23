import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appointmentCalendarSyncService } from '../../../src/backend/services/appointmentCalendarSync.service'
import { googleCalendarService } from '../../../src/backend/services/googleCalendar.service'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('appointmentCalendarSync.service', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('synchronizes pending future appointments with Google Calendar', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: true,
      sendClientInvites: true
    })
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',
        clientId: 'client-1',
        guestName: null,
        guestPhone: null,
        userId: 'user-1',
        serviceId: 'service-1',
        date: new Date('2099-06-15T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null,
        client: { firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com', phone: '600000000' },
        user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
        service: { id: 'service-1', name: 'Limpieza facial' },
        appointmentServices: [],
        createdAt: new Date('2099-06-01T10:00:00.000Z'),
        updatedAt: new Date('2099-06-01T10:00:00.000Z'),
        reminder: true,
        notes: null,
        cabin: 'LUCY',
        professional: 'Lucy',
        googleCalendarSyncedAt: null
      }
    ])
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1'
    })

    const syncSpy = vi
      .spyOn(googleCalendarService, 'upsertAppointmentEvent')
      .mockResolvedValue({
        eventId: 'event-1',
        status: 'SYNCED',
        error: null
      })

    const summary = await appointmentCalendarSyncService.syncFutureAppointments({
      appointmentIds: ['appointment-1'],
      reason: 'unit-test'
    })

    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appointment-1',
        existingEventId: null,
        clientEmail: 'ana@example.com'
      }),
      { forceSync: false }
    )
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: {
        googleCalendarEventId: 'event-1',
        googleCalendarSyncStatus: 'SYNCED',
        googleCalendarSyncError: null,
        googleCalendarSyncedAt: expect.any(Date)
      }
    })
    expect(summary).toEqual({
      total: 1,
      synced: 1,
      failed: 0,
      skipped: 0,
      appointments: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      },
      agendaBlocks: {
        total: 0,
        synced: 0,
        failed: 0,
        skipped: 0
      }
    })
  })

  it('skips synchronization when Google Calendar is disabled', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue(null)

    const syncSpy = vi.spyOn(googleCalendarService, 'upsertAppointmentEvent')

    const summary = await appointmentCalendarSyncService.syncFutureAppointments({
      appointmentIds: ['appointment-1']
    })

    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
    expect(summary).toEqual({
      total: 0,
      synced: 0,
      failed: 0,
      skipped: 0,
      appointments: {
        total: 0,
        synced: 0,
        failed: 0,
        skipped: 0
      },
      agendaBlocks: {
        total: 0,
        synced: 0,
        failed: 0,
        skipped: 0
      }
    })
  })

  it('links existing Google Calendar events without creating new ones', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: false,
      sendClientInvites: true
    })
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',
        clientId: 'client-1',
        guestName: null,
        guestPhone: null,
        userId: 'user-1',
        serviceId: 'service-1',
        date: new Date('2099-06-15T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null,
        client: { firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com', phone: '600000000' },
        user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
        service: { id: 'service-1', name: 'Limpieza facial' },
        appointmentServices: [],
        createdAt: new Date('2099-06-01T10:00:00.000Z'),
        updatedAt: new Date('2099-06-01T10:00:00.000Z'),
        reminder: true,
        notes: null,
        cabin: 'LUCY',
        professional: 'Lucy',
        googleCalendarSyncedAt: null
      }
    ])
    prismaMock.agendaBlock.findMany.mockResolvedValue([])
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1'
    })

    const listSpy = vi.spyOn(googleCalendarService, 'listEventsInRange').mockResolvedValue([
      {
        id: 'event-1',
        status: 'confirmed',
        summary: 'Limpieza facial - Ana Lopez',
        description: 'Cita para Limpieza facial\nCliente: Ana Lopez\nTelefono: 600000000',
        attendeeEmails: ['ana@example.com'],
        startDateTime: '2099-06-15T10:00:00+02:00',
        endDateTime: '2099-06-15T10:30:00+02:00',
        privateAppointmentId: null
      }
    ])
    const upsertSpy = vi.spyOn(googleCalendarService, 'upsertAppointmentEvent')

    const summary = await appointmentCalendarSyncService.linkExistingAgenda({
      reason: 'unit-test-link'
    })

    expect(listSpy).toHaveBeenCalledWith({
      timeMin: '2099-06-15T08:00:00+02:00',
      timeMax: '2099-06-15T12:30:00+02:00'
    })
    expect(upsertSpy).not.toHaveBeenCalled()
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: {
        googleCalendarEventId: 'event-1',
        googleCalendarSyncStatus: 'SYNCED',
        googleCalendarSyncError: null,
        googleCalendarSyncedAt: expect.any(Date)
      }
    })
    expect(summary).toEqual({
      total: 1,
      synced: 1,
      failed: 0,
      skipped: 0,
      appointments: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      },
      agendaBlocks: {
        total: 0,
        synced: 0,
        failed: 0,
        skipped: 0
      }
    })
  })

  it('links guest appointments when the remote event keeps service and client text but not the exact title', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: false,
      sendClientInvites: true
    })
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-guest-1',
        clientId: null,
        guestName: 'Maria Perez',
        guestPhone: '600123123',
        userId: 'user-1',
        serviceId: 'service-1',
        date: new Date('2099-06-15T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null,
        client: null,
        user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
        service: { id: 'service-1', name: 'Limpieza facial' },
        appointmentServices: [],
        createdAt: new Date('2099-06-01T10:00:00.000Z'),
        updatedAt: new Date('2099-06-01T10:00:00.000Z'),
        reminder: false,
        notes: null,
        cabin: 'LUCY',
        professional: 'Lucy',
        googleCalendarSyncedAt: null
      }
    ])
    prismaMock.agendaBlock.findMany.mockResolvedValue([])
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-guest-1'
    })

    vi.spyOn(googleCalendarService, 'listEventsInRange').mockResolvedValue([
      {
        id: 'event-guest-1',
        status: 'confirmed',
        summary: 'Maria Perez / Limpieza facial',
        description: 'Servicio: Limpieza facial\nCliente: Maria Perez\nTelefono: 600123123',
        attendeeEmails: [],
        startDateTime: '2099-06-15T10:00:00+02:00',
        endDateTime: '2099-06-15T10:30:00+02:00',
        privateAppointmentId: null
      }
    ])

    const summary = await appointmentCalendarSyncService.linkExistingAgenda({
      reason: 'unit-test-link-guest'
    })

    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-guest-1' },
      data: {
        googleCalendarEventId: 'event-guest-1',
        googleCalendarSyncStatus: 'SYNCED',
        googleCalendarSyncError: null,
        googleCalendarSyncedAt: expect.any(Date)
      }
    })
    expect(summary).toEqual({
      total: 1,
      synced: 1,
      failed: 0,
      skipped: 0,
      appointments: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      },
      agendaBlocks: {
        total: 0,
        synced: 0,
        failed: 0,
        skipped: 0
      }
    })
  })

  it('links agenda blocks when the remote event keeps professional and cabin details with a variant title', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: false,
      sendClientInvites: true
    })
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.agendaBlock.findMany.mockResolvedValue([
      {
        id: 'block-variant-1',
        professional: 'Tamara',
        calendarInviteEmail: null,
        cabin: 'CABINA_2',
        date: new Date('2099-06-16T00:00:00.000Z'),
        startTime: '12:00',
        endTime: '13:00',
        notes: 'Formacion',
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED'
      }
    ])
    prismaMock.agendaBlock.update.mockResolvedValue({
      id: 'block-variant-1'
    })

    vi.spyOn(googleCalendarService, 'listEventsInRange').mockResolvedValue([
      {
        id: 'event-block-1',
        status: 'confirmed',
        summary: 'Agenda bloqueada',
        description: 'Profesional: Tamara\nCabina: Cabina 2\nObservaciones: Formacion',
        attendeeEmails: [],
        startDateTime: '2099-06-16T12:00:00+02:00',
        endDateTime: '2099-06-16T13:00:00+02:00',
        privateAppointmentId: null
      }
    ])

    const summary = await appointmentCalendarSyncService.linkExistingAgenda({
      reason: 'unit-test-link-block'
    })

    expect(prismaMock.agendaBlock.update).toHaveBeenCalledWith({
      where: { id: 'block-variant-1' },
      data: {
        googleCalendarEventId: 'event-block-1',
        googleCalendarSyncStatus: 'SYNCED',
        googleCalendarSyncError: null,
        googleCalendarSyncedAt: expect.any(Date)
      }
    })
    expect(summary).toEqual({
      total: 1,
      synced: 1,
      failed: 0,
      skipped: 0,
      appointments: {
        total: 0,
        synced: 0,
        failed: 0,
        skipped: 0
      },
      agendaBlocks: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      }
    })
  })

  it('skips link-only reconciliation when two remote events are equally plausible matches', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: false,
      sendClientInvites: true
    })
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-ambiguous-1',
        clientId: null,
        guestName: 'Maria Perez',
        guestPhone: '600123123',
        userId: 'user-1',
        serviceId: 'service-1',
        date: new Date('2099-06-15T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null,
        client: null,
        user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
        service: { id: 'service-1', name: 'Limpieza facial' },
        appointmentServices: [],
        createdAt: new Date('2099-06-01T10:00:00.000Z'),
        updatedAt: new Date('2099-06-01T10:00:00.000Z'),
        reminder: false,
        notes: null,
        cabin: 'LUCY',
        professional: 'Lucy',
        googleCalendarSyncedAt: null
      }
    ])
    prismaMock.agendaBlock.findMany.mockResolvedValue([])

    vi.spyOn(googleCalendarService, 'listEventsInRange').mockResolvedValue([
      {
        id: 'event-ambiguous-1',
        status: 'confirmed',
        summary: 'Maria Perez / Limpieza facial',
        description: 'Servicio: Limpieza facial\nCliente: Maria Perez',
        attendeeEmails: [],
        startDateTime: '2099-06-15T10:00:00+02:00',
        endDateTime: '2099-06-15T10:30:00+02:00',
        privateAppointmentId: null
      },
      {
        id: 'event-ambiguous-2',
        status: 'confirmed',
        summary: 'Reserva Maria Perez Limpieza facial',
        description: 'Cliente: Maria Perez\nServicio: Limpieza facial',
        attendeeEmails: [],
        startDateTime: '2099-06-15T10:00:00+02:00',
        endDateTime: '2099-06-15T10:30:00+02:00',
        privateAppointmentId: null
      }
    ])

    const summary = await appointmentCalendarSyncService.linkExistingAgenda({
      reason: 'unit-test-link-ambiguous'
    })

    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'GOOGLE_CALENDAR_REVIEW',
        title: 'Google Calendar requiere revision manual',
        priority: 'HIGH'
      })
    })
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
    expect(summary).toEqual({
      total: 1,
      synced: 0,
      failed: 0,
      skipped: 1,
      appointments: {
        total: 1,
        synced: 0,
        failed: 0,
        skipped: 1
      },
      agendaBlocks: {
        total: 0,
        synced: 0,
        failed: 0,
        skipped: 0
      }
    })
  })

  it('synchronizes the full agenda manually, including agenda blocks, even when automatic sync is disabled', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: false,
      sendClientInvites: true
    })
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',
        clientId: 'client-1',
        guestName: null,
        guestPhone: null,
        userId: 'user-1',
        serviceId: 'service-1',
        date: new Date('2024-06-15T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        googleCalendarEventId: 'event-1',
        googleCalendarSyncStatus: 'SYNCED',
        googleCalendarSyncError: null,
        client: { firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com', phone: '600000000' },
        user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
        service: { id: 'service-1', name: 'Limpieza facial' },
        appointmentServices: [],
        createdAt: new Date('2024-06-01T10:00:00.000Z'),
        updatedAt: new Date('2024-06-01T10:00:00.000Z'),
        reminder: true,
        notes: null,
        cabin: 'LUCY',
        professional: 'Lucy',
        googleCalendarSyncedAt: new Date('2024-06-01T10:05:00.000Z')
      }
    ])
    prismaMock.agendaBlock.findMany.mockResolvedValue([
      {
        id: 'block-1',
        professional: 'Tamara',
        calendarInviteEmail: 'tamara@example.com',
        cabin: 'TAMARA',
        date: new Date('2024-06-16T00:00:00.000Z'),
        startTime: '12:00',
        endTime: '13:00',
        notes: 'Formacion',
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED'
      }
    ])
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1'
    })
    prismaMock.agendaBlock.update.mockResolvedValue({
      id: 'block-1'
    })

    const syncSpy = vi
      .spyOn(googleCalendarService, 'upsertAppointmentEvent')
      .mockResolvedValueOnce({
        eventId: 'event-1',
        status: 'SYNCED',
        error: null
      })
      .mockResolvedValueOnce({
        eventId: 'event-2',
        status: 'SYNCED',
        error: null
      })

    const summary = await appointmentCalendarSyncService.syncEntireAgenda({
      reason: 'unit-test-manual'
    })

    expect(syncSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        appointmentId: 'appointment-1',
        existingEventId: 'event-1'
      }),
      { forceSync: true }
    )
    expect(syncSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        appointmentId: 'block-1',
        title: 'Bloqueo - Tamara'
      }),
      { forceSync: true }
    )
    expect(prismaMock.agendaBlock.update).toHaveBeenCalledWith({
      where: { id: 'block-1' },
      data: {
        googleCalendarEventId: 'event-2',
        googleCalendarSyncStatus: 'SYNCED',
        googleCalendarSyncError: null,
        googleCalendarSyncedAt: expect.any(Date)
      }
    })
    expect(summary).toEqual({
      total: 2,
      synced: 2,
      failed: 0,
      skipped: 0,
      appointments: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      },
      agendaBlocks: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      }
    })
  })

  it('synchronizes only pending local items during the manual pending sync', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: false,
      sendClientInvites: true
    })
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-1',
        clientId: 'client-1',
        guestName: null,
        guestPhone: null,
        userId: 'user-1',
        serviceId: 'service-1',
        date: new Date('2099-06-15T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '10:30',
        status: 'SCHEDULED',
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null,
        client: { firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com', phone: '600000000' },
        user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
        service: { id: 'service-1', name: 'Limpieza facial' },
        appointmentServices: [],
        createdAt: new Date('2099-06-01T10:00:00.000Z'),
        updatedAt: new Date('2099-06-01T10:00:00.000Z'),
        reminder: true,
        notes: null,
        cabin: 'LUCY',
        professional: 'Lucy',
        googleCalendarSyncedAt: null
      }
    ])
    prismaMock.agendaBlock.findMany.mockResolvedValue([
      {
        id: 'block-1',
        professional: 'Tamara',
        calendarInviteEmail: 'tamara@example.com',
        cabin: 'TAMARA',
        date: new Date('2099-06-16T00:00:00.000Z'),
        startTime: '12:00',
        endTime: '13:00',
        notes: 'Formacion',
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED'
      }
    ])
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1'
    })
    prismaMock.agendaBlock.update.mockResolvedValue({
      id: 'block-1'
    })

    const syncSpy = vi
      .spyOn(googleCalendarService, 'upsertAppointmentEvent')
      .mockResolvedValueOnce({
        eventId: 'event-1',
        status: 'SYNCED',
        error: null
      })
      .mockResolvedValueOnce({
        eventId: 'event-2',
        status: 'SYNCED',
        error: null
      })

    const summary = await appointmentCalendarSyncService.syncPendingAgenda({
      reason: 'unit-test-pending'
    })

    expect(syncSpy).toHaveBeenCalledTimes(2)
    expect(summary).toEqual({
      total: 2,
      synced: 2,
      failed: 0,
      skipped: 0,
      appointments: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      },
      agendaBlocks: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      }
    })
  })

  it('reuses the active sync run when a second sync starts before the first one finishes', async () => {
    prismaMock.googleCalendarConfig.findFirst.mockResolvedValue({
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: true,
      sendClientInvites: true
    })
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([
        {
          id: 'appointment-1',
          clientId: 'client-1',
          guestName: null,
          guestPhone: null,
          userId: 'user-1',
          serviceId: 'service-1',
          date: new Date('2099-06-15T00:00:00.000Z'),
          startTime: '10:00',
          endTime: '10:30',
          status: 'SCHEDULED',
          googleCalendarEventId: null,
          googleCalendarSyncStatus: 'DISABLED',
          googleCalendarSyncError: null,
          client: { firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com', phone: '600000000' },
          user: { id: 'user-1', name: 'Lucy', email: 'admin@lucy3000.com' },
          service: { id: 'service-1', name: 'Limpieza facial' },
          appointmentServices: [],
          createdAt: new Date('2099-06-01T10:00:00.000Z'),
          updatedAt: new Date('2099-06-01T10:00:00.000Z'),
          reminder: true,
          notes: null,
          cabin: 'LUCY',
          professional: 'Lucy',
          googleCalendarSyncedAt: null
        }
      ])
      .mockResolvedValueOnce([])
    prismaMock.appointment.update.mockResolvedValue({
      id: 'appointment-1'
    })

    let resolveSync: ((value: { eventId: string; status: 'SYNCED'; error: null }) => void) | null = null
    const syncSpy = vi.spyOn(googleCalendarService, 'upsertAppointmentEvent').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve
        })
    )

    const firstSyncPromise = appointmentCalendarSyncService.syncFutureAppointments({
      appointmentIds: ['appointment-1'],
      reason: 'unit-test-first'
    })
    await vi.waitFor(() => {
      expect(prismaMock.appointment.findMany).toHaveBeenCalledTimes(1)
    })

    const secondSyncPromise = appointmentCalendarSyncService.syncFutureAppointments({
      appointmentIds: ['appointment-1'],
      reason: 'unit-test-second'
    })

    expect(prismaMock.appointment.findMany).toHaveBeenCalledTimes(1)
    expect(syncSpy).toHaveBeenCalledTimes(1)

    resolveSync?.({
      eventId: 'event-1',
      status: 'SYNCED',
      error: null
    })

    const [firstSummary, secondSummary] = await Promise.all([firstSyncPromise, secondSyncPromise])

    expect(firstSummary).toEqual({
      total: 1,
      synced: 1,
      failed: 0,
      skipped: 0,
      appointments: {
        total: 1,
        synced: 1,
        failed: 0,
        skipped: 0
      },
      agendaBlocks: {
        total: 0,
        synced: 0,
        failed: 0,
        skipped: 0
      }
    })
    expect(secondSummary).toEqual(firstSummary)

    await vi.waitFor(() => {
      expect(prismaMock.appointment.findMany).toHaveBeenCalledTimes(2)
    })
    expect(syncSpy).toHaveBeenCalledTimes(1)
  })
})
