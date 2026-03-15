import axios from 'axios'

const DEFAULT_WHATSAPP_API_VERSION = 'v23.0'
const DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE = 'es'
const DEFAULT_COUNTRY_CODE = '34'

export type WhatsAppReminderPayload = {
  appointmentId: string
  clientName: string
  serviceName: string
  appointmentDate: Date | string
  appointmentStartTime: string
  phone: string
}

export type WhatsAppSendResult = {
  success: boolean
  messageId?: string
  error?: string
}

type WhatsAppConfig = {
  enabled: boolean
  accessToken: string
  phoneNumberId: string
  templateName: string
  templateLanguage: string
  apiVersion: string
  defaultCountryCode: string
}

const onlyDigits = (value: string) => value.replace(/\D/g, '')

export const normalizePhoneForWhatsApp = (rawPhone: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null => {
  const source = String(rawPhone || '').trim()
  if (!source) return null

  const countryCode = onlyDigits(defaultCountryCode) || DEFAULT_COUNTRY_CODE
  const hasPlusPrefix = source.startsWith('+')
  const withoutPrefix = source.startsWith('00') ? source.slice(2) : source
  let digits = onlyDigits(hasPlusPrefix ? source : withoutPrefix)

  if (!digits) return null

  if (!hasPlusPrefix && !source.startsWith('00')) {
    if (digits.length <= 9) {
      digits = `${countryCode}${digits.replace(/^0+/, '')}`
    } else if (!digits.startsWith(countryCode) && digits.length < 12) {
      digits = `${countryCode}${digits}`
    }
  }

  if (digits.length < 10 || digits.length > 15) {
    return null
  }

  return digits
}

const formatDateForReminder = (value: Date | string) =>
  new Date(value).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })

const toErrorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as any).response?.data?.error?.message
  ) {
    return String((error as any).response.data.error.message)
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown WhatsApp error'
}

class WhatsAppService {
  private getConfig(): WhatsAppConfig {
    return {
      enabled: process.env.WHATSAPP_REMINDERS_ENABLED === 'true',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      templateName: process.env.WHATSAPP_TEMPLATE_NAME || '',
      templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE,
      apiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_WHATSAPP_API_VERSION,
      defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || DEFAULT_COUNTRY_CODE
    }
  }

  isEnabled() {
    return this.getConfig().enabled
  }

  isConfigured() {
    const config = this.getConfig()
    return Boolean(config.accessToken && config.phoneNumberId && config.templateName)
  }

  async sendAppointmentReminder(payload: WhatsAppReminderPayload): Promise<WhatsAppSendResult> {
    const config = this.getConfig()

    if (!config.enabled) {
      return { success: false, error: 'WhatsApp reminders are disabled' }
    }

    if (!this.isConfigured()) {
      return { success: false, error: 'WhatsApp API is not configured' }
    }

    const normalizedPhone = normalizePhoneForWhatsApp(payload.phone, config.defaultCountryCode)
    if (!normalizedPhone) {
      return { success: false, error: 'Invalid phone number format for WhatsApp' }
    }

    try {
      const response = await axios.post(
        `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: config.templateName,
            language: { code: config.templateLanguage },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: payload.clientName },
                  { type: 'text', text: payload.serviceName },
                  { type: 'text', text: formatDateForReminder(payload.appointmentDate) },
                  { type: 'text', text: payload.appointmentStartTime }
                ]
              }
            ]
          }
        },
        {
          timeout: 15_000,
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      return {
        success: true,
        messageId: response.data?.messages?.[0]?.id
      }
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error)
      }
    }
  }
}

export const whatsappService = new WhatsAppService()
