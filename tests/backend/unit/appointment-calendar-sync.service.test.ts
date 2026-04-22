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
