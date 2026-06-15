import { logInfo, logWarn } from '../utils/logger'

const DEFAULT_PASSWORD_RESET_FROM = 'Lucy3000 <onboarding@resend.dev>'
const DEFAULT_PASSWORD_RESET_BASE_URL = 'https://lucy3000-web.onrender.com'

type ResendEmailResponse = {
  id?: string
  message?: string
}

type ResendEmailError = Error & {
  responseBody?: ResendEmailResponse
  status?: number
}

export type PasswordResetEmailInput = {
  email: string
  name: string
  resetUrl: string
  tenantName: string
}

export type PasswordResetEmailResult = {
  delivered: boolean
  recipient: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

export const getPasswordResetBaseUrl = () =>
  (process.env.PASSWORD_RESET_BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    DEFAULT_PASSWORD_RESET_BASE_URL)
    .trim()
    .replace(/\/+$/, '')

export const sendPasswordResetEmail = async (
  input: PasswordResetEmailInput
): Promise<PasswordResetEmailResult> => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    logWarn('Password reset email provider is not configured', {
      recipient: input.email,
      tenantName: input.tenantName
    })

    return { delivered: false, recipient: input.email }
  }

  const from = (process.env.PASSWORD_RESET_FROM || process.env.TRIAL_REQUEST_FROM || DEFAULT_PASSWORD_RESET_FROM).trim()
  const subject = 'Restablecer contrasena de Lucy3000'
  const text = [
    `Hola ${input.name},`,
    '',
    `Hemos recibido una solicitud para restablecer la contrasena de ${input.tenantName}.`,
    'Abre este enlace para crear una contrasena nueva:',
    input.resetUrl,
    '',
    'El enlace caduca en 30 minutos. Si no has solicitado este cambio, puedes ignorar este correo.'
  ].join('\n')
  const html = [
    `<p>Hola ${escapeHtml(input.name)},</p>`,
    `<p>Hemos recibido una solicitud para restablecer la contrasena de <strong>${escapeHtml(input.tenantName)}</strong>.</p>`,
    `<p><a href="${escapeHtml(input.resetUrl)}">Crear una contrasena nueva</a></p>`,
    '<p>El enlace caduca en 30 minutos. Si no has solicitado este cambio, puedes ignorar este correo.</p>'
  ].join('')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject,
      text,
      html
    })
  })

  const responseBody = (await response.json().catch(() => ({}))) as ResendEmailResponse

  if (!response.ok) {
    const error = new Error(responseBody.message || 'Password reset email delivery failed') as ResendEmailError
    error.status = response.status
    error.responseBody = responseBody
    throw error
  }

  logInfo('Password reset email delivered', {
    emailId: responseBody.id || null,
    recipient: input.email
  })

  return { delivered: true, recipient: input.email }
}
