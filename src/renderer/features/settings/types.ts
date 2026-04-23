export type GoogleCalendarConfig = {
  connected: boolean
  enabled: boolean
  sendClientInvites: boolean
  calendarId: string
  oauthConfigured: boolean
  missingEnvVars: string[]
  redirectUri?: string | null
}

export const DEFAULT_CALENDAR_CONFIG: GoogleCalendarConfig = {
  connected: false,
  enabled: false,
  sendClientInvites: true,
  calendarId: 'primary',
  oauthConfigured: true,
  missingEnvVars: [],
  redirectUri: null
}

export const GOOGLE_CALENDAR_MESSAGE_SOURCE = 'lucy3000-google-calendar-oauth'

export type SettingsImportModal =
  | 'appointments'
  | 'clients'
  | 'services'
  | 'products'
  | 'bonos'
  | 'abonos'
  | 'clientBonos'
  | null
