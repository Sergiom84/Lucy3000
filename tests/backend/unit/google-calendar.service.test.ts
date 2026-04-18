import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_CALENDAR_RECONNECT_MESSAGE,
  GoogleCalendarService,
  isGoogleInvalidGrantError
} from '../../../src/backend/services/googleCalendar.service'
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock'

vi.mock('../../../src/backend/db', async () => import('../mocks/db.mock'))

describe('googleCalendar.service', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('detects invalid_grant errors from Google responses', () => {
    expect(
      isGoogleInvalidGrantError({
        response: {
          data: {
            error: 'invalid_grant'
          }
        }
      })
    ).toBe(true)

    expect(isGoogleInvalidGrantError(new Error('invalid_grant'))).toBe(true)
    expect(isGoogleInvalidGrantError(new Error('permission denied'))).toBe(false)
  })

  it('returns reconnect guidance and removes invalid calendar config on invalid_grant', async () => {
    const service = new GoogleCalendarService()
    const config = {
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: true,
      sendClientInvites: true
    }

    vi.spyOn(service as any, 'getStoredConfig').mockResolvedValue(config)
    vi.spyOn(service as any, 'getAuthorizedCalendar').mockResolvedValue({
      config,
      calendar: {
        events: {
          insert: vi.fn().mockRejectedValue({
            response: {
              data: {
                error: 'invalid_grant'
              }
            }
          })
        }
      }
    })
    prismaMock.googleCalendarConfig.delete.mockResolvedValue(undefined)

    const result = await service.upsertAppointmentEvent({
      appointmentId: 'appointment-1',
      title: 'Limpieza facial - Ana',
      description: 'Cita',
      date: '2099-06-15',
      startTime: '10:00',
      endTime: '10:30',
      clientEmail: 'ana@example.com',
      clientName: 'Ana'
    })

    expect(result).toEqual({
      eventId: null,
      status: 'ERROR',
      error: GOOGLE_CALENDAR_RECONNECT_MESSAGE
    })
    expect(prismaMock.googleCalendarConfig.delete).toHaveBeenCalledWith({
      where: { id: 'calendar-config-1' }
    })
  })

  it('forces invite emails for agenda blocks even when client invites are disabled globally', async () => {
    const service = new GoogleCalendarService()
    const config = {
      id: 'calendar-config-1',
      refreshToken: 'refresh-token',
      calendarId: 'primary',
      enabled: true,
      sendClientInvites: false
    }
    const insert = vi.fn().mockResolvedValue({
      data: {
        id: 'event-1'
      }
    })

    vi.spyOn(service as any, 'getStoredConfig').mockResolvedValue(config)
    vi.spyOn(service as any, 'getAuthorizedCalendar').mockResolvedValue({
      config,
      calendar: {
        events: {
          insert
        }
      }
    })

    const result = await service.upsertAppointmentEvent({
      appointmentId: 'agenda-block-1',
      title: 'Bloqueo - Tamara',
      description: 'Bloqueo de agenda',
      date: '2099-06-15',
      startTime: '10:00',
      endTime: '10:30',
      clientEmail: 'tamara@example.com',
      clientName: 'Tamara',
      forceSendUpdates: true
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        sendUpdates: 'all'
      })
    )
    expect(result).toEqual({
      eventId: 'event-1',
      status: 'SYNCED',
      error: null
    })
  })
})
