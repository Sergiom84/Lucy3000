import { OAuth2Client } from 'google-auth-library'
import { calendar_v3, google } from 'googleapis'
import jwt from 'jsonwebtoken'
import { prisma } from '../db'
import { getJwtSecret } from '../utils/jwt'

const GOOGLE_CALENDAR_TIMEZONE = 'Europe/Madrid'
const OAUTH_STATE_SCOPE = 'google-calendar-oauth'
const OAUTH_STATE_TTL_SECONDS = 60 * 10
const GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events']

type AuthenticatedCalendarUser = {
  id: string
  role: string
}

type OAuthStatePayload = {
  sub: string
  role: string
  scope: typeof OAUTH_STATE_SCOPE
}

type StoredGoogleCalendarConfig = {
  id: string
  refreshToken: string
  calendarId: string
  enabled: boolean
  sendClientInvites: boolean
}

export type CalendarSyncStatus = 'DISABLED' | 'SYNCED' | 'ERROR'

export type AppointmentSyncInput = {
  appointmentId: string
  title: string
  description: string
  date: Date | string
  startTime: string
  endTime: string
  clientEmail?: string | null
  clientName: string
  existingEventId?: string | null
}

export type CalendarSyncResult = {
  eventId: string | null
  status: CalendarSyncStatus
  error: string | null
}

const isRecordNotFound = (error: unknown) => {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    ((error as { code?: number | string }).code === 404 || (error as { code?: number | string }).code === '404')
  )
}

const toDatePart = (value: Date | string) => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  const normalized = String(value).trim()
  if (!normalized) {
    throw new Error('Appointment date is required')
  }

  return normalized.includes('T') ? normalized.split('T')[0] : normalized
}

const toCalendarDateTime = (date: Date | string, time: string) => `${toDatePart(date)}T${time}:00`

export class GoogleCalendarService {
  private getOAuthEnv() {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Google Calendar environment variables are not configured')
    }

    return { clientId, clientSecret, redirectUri }
  }

  private createOAuthClient() {
    const { clientId, clientSecret, redirectUri } = this.getOAuthEnv()
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  }

  private async getStoredConfig() {
    return prisma.googleCalendarConfig.findFirst()
  }

  private async getAuthorizedCalendar(forceWhenDisabled = false): Promise<{
    calendar: calendar_v3.Calendar
    config: StoredGoogleCalendarConfig
  }> {
    const config = await this.getStoredConfig()

    if (!config) {
      throw new Error('Google Calendar is not connected')
    }

    if (!config.enabled && !forceWhenDisabled) {
      throw new Error('Google Calendar sync is disabled')
    }

    const oauthClient = this.createOAuthClient()
    oauthClient.setCredentials({
      refresh_token: config.refreshToken
    })

    return {
      calendar: google.calendar({ version: 'v3', auth: oauthClient }),
      config
    }
  }

  private buildEventRequest(input: AppointmentSyncInput): calendar_v3.Schema$Event {
    const attendees = input.clientEmail
      ? [{ email: input.clientEmail, displayName: input.clientName }]
      : undefined

    return {
      summary: input.title,
      description: input.description,
      start: {
        dateTime: toCalendarDateTime(input.date, input.startTime),
        timeZone: GOOGLE_CALENDAR_TIMEZONE
      },
      end: {
        dateTime: toCalendarDateTime(input.date, input.endTime),
        timeZone: GOOGLE_CALENDAR_TIMEZONE
      },
      attendees,
      extendedProperties: {
        private: {
          appointmentId: input.appointmentId
        }
      }
    }
  }

  private getSendUpdates(config: StoredGoogleCalendarConfig, clientEmail?: string | null) {
    return config.sendClientInvites && clientEmail ? 'all' : 'none'
  }

  private formatGoogleError(error: unknown) {
    if (error instanceof Error) {
      return error.message
    }

    return 'Unknown Google Calendar error'
  }

  buildAuthUrl(user: AuthenticatedCalendarUser): string {
    const oauthClient = this.createOAuthClient()
    const state = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        scope: OAUTH_STATE_SCOPE
      } satisfies OAuthStatePayload,
      getJwtSecret(),
      { expiresIn: OAUTH_STATE_TTL_SECONDS }
    )

    return oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: GOOGLE_CALENDAR_SCOPES,
      state
    })
  }

  verifyAuthState(state: string): AuthenticatedCalendarUser {
    const payload = jwt.verify(state, getJwtSecret()) as OAuthStatePayload

    if (payload.scope !== OAUTH_STATE_SCOPE) {
      throw new Error('Invalid Google Calendar OAuth state')
    }

    return {
      id: payload.sub,
      role: payload.role
    }
  }

  async saveTokens(code: string): Promise<void> {
    const oauthClient = this.createOAuthClient()
    const { tokens } = await oauthClient.getToken(code)
    const existingConfig = await this.getStoredConfig()
    const refreshToken = tokens.refresh_token || existingConfig?.refreshToken

    if (!refreshToken) {
      throw new Error('Google did not return a refresh token. Revoke access and authorize again.')
    }

    if (existingConfig) {
      await prisma.googleCalendarConfig.update({
        where: { id: existingConfig.id },
        data: {
          refreshToken,
          enabled: true
        }
      })
      return
    }

    await prisma.googleCalendarConfig.create({
      data: {
        refreshToken,
        enabled: true
      }
    })
  }

  async getConfig() {
    return this.getStoredConfig()
  }

  async updateConfig(data: { enabled?: boolean; sendClientInvites?: boolean; calendarId?: string }) {
    const existingConfig = await this.getStoredConfig()

    if (!existingConfig) {
      throw new Error('No existe configuración de Google Calendar. Primero debes autorizar la aplicación.')
    }

    return prisma.googleCalendarConfig.update({
      where: { id: existingConfig.id },
      data
    })
  }

  async upsertAppointmentEvent(input: AppointmentSyncInput): Promise<CalendarSyncResult> {
    const config = await this.getStoredConfig()

    if (!config || !config.enabled) {
      return {
        eventId: input.existingEventId || null,
        status: 'DISABLED',
        error: null
      }
    }

    try {
      const { calendar, config: activeConfig } = await this.getAuthorizedCalendar()
      const requestBody = this.buildEventRequest(input)
      const sendUpdates = this.getSendUpdates(activeConfig, input.clientEmail)

      if (input.existingEventId) {
        try {
          const patchedEvent = await calendar.events.patch({
            calendarId: activeConfig.calendarId,
            eventId: input.existingEventId,
            requestBody,
            sendUpdates
          })

          return {
            eventId: patchedEvent.data.id || input.existingEventId,
            status: 'SYNCED',
            error: null
          }
        } catch (error) {
          if (!isRecordNotFound(error)) {
            throw error
          }
        }
      }

      const createdEvent = await calendar.events.insert({
        calendarId: activeConfig.calendarId,
        requestBody,
        sendUpdates
      })

      return {
        eventId: createdEvent.data.id || null,
        status: 'SYNCED',
        error: null
      }
    } catch (error) {
      return {
        eventId: input.existingEventId || null,
        status: 'ERROR',
        error: this.formatGoogleError(error)
      }
    }
  }

  async deleteAppointmentEvent(eventId: string | null, clientEmail?: string | null): Promise<CalendarSyncResult> {
    if (!eventId) {
      return {
        eventId: null,
        status: 'DISABLED',
        error: null
      }
    }

    const config = await this.getStoredConfig()
    if (!config) {
      return {
        eventId,
        status: 'DISABLED',
        error: null
      }
    }

    try {
      const { calendar, config: activeConfig } = await this.getAuthorizedCalendar(true)

      await calendar.events.delete({
        calendarId: activeConfig.calendarId,
        eventId,
        sendUpdates: this.getSendUpdates(activeConfig, clientEmail)
      })

      return {
        eventId: null,
        status: 'DISABLED',
        error: null
      }
    } catch (error) {
      if (isRecordNotFound(error)) {
        return {
          eventId: null,
          status: 'DISABLED',
          error: null
        }
      }

      return {
        eventId,
        status: 'ERROR',
        error: this.formatGoogleError(error)
      }
    }
  }

  async disconnect(): Promise<void> {
    const config = await this.getStoredConfig()

    if (!config) {
      return
    }

    try {
      const oauthClient = this.createOAuthClient()
      await oauthClient.revokeToken(config.refreshToken)
    } catch (error) {
      console.warn('Google Calendar token revocation failed:', this.formatGoogleError(error))
    }

    await prisma.googleCalendarConfig.delete({
      where: { id: config.id }
    })

    await prisma.appointment.updateMany({
      data: {
        googleCalendarEventId: null,
        googleCalendarSyncStatus: 'DISABLED',
        googleCalendarSyncError: null,
        googleCalendarSyncedAt: null
      }
    })
  }
}

export const googleCalendarService = new GoogleCalendarService()
