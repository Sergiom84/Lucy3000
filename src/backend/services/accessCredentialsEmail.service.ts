import { logInfo, logWarn } from '../utils/logger'

const DEFAULT_ACCESS_EMAIL_FROM = 'Lucy3000 <Info@sohl.dev>'
const DEFAULT_LOGIN_URL = 'https://lucy3000-web.onrender.com'

type ResendEmailResponse = {
  id?: string
  message?: string
  name?: string
}

type ResendEmailError = Error & {
  responseBody?: ResendEmailResponse
  status?: number
}

export type AccessCredentialsEmailInput = {
  email: string
  name: string
  tenantName: string
  tenantCode: number
  username: string
  password: string
}

export type AccessCredentialsEmailResult = {
  delivered: boolean
  emailId?: string
  recipient: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const sendResendEmail = async ({
  apiKey,
  from,
  html,
  subject,
  text,
  to
}: {
  apiKey: string
  from: string
  html: string
  subject: string
  text: string
  to: string
}) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: [to], subject, text, html })
  })

  const responseBody = (await response.json().catch(() => ({}))) as ResendEmailResponse

  if (!response.ok) {
    const error = new Error(responseBody.message || 'Access credentials email delivery failed') as ResendEmailError
    error.status = response.status
    error.responseBody = responseBody
    throw error
  }

  return responseBody
}

export const sendAccessCredentialsEmail = async (
  input: AccessCredentialsEmailInput
): Promise<AccessCredentialsEmailResult> => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const recipient = input.email

  if (!apiKey) {
    logWarn('Access credentials email provider is not configured', {
      recipient,
      tenantCode: input.tenantCode
    })

    return { delivered: false, recipient }
  }

  const from = (process.env.TRIAL_REQUEST_FROM || DEFAULT_ACCESS_EMAIL_FROM).trim()
  const loginUrl = (process.env.PLATFORM_WEB_URL || DEFAULT_LOGIN_URL).trim()
  const subject = `Acceso a Lucy3000 - ${input.tenantName}`
  const text = [
    `Hola ${input.name},`,
    '',
    'Ya tienes acceso a Lucy3000. Estos son tus datos de acceso:',
    '',
    `ID cliente: ${input.tenantCode}`,
    `Usuario: ${input.username}`,
    `Contraseña: ${input.password}`,
    '',
    `Accede desde: ${loginUrl}`,
    '',
    'Gracias por confiar en Lucy3000.'
  ].join('\n')
  const html = [
    `<p>Hola ${escapeHtml(input.name)},</p>`,
    '<p>Ya tienes acceso a Lucy3000. Estos son tus datos de acceso:</p>',
    '<ul>',
    `<li><strong>ID cliente:</strong> ${input.tenantCode}</li>`,
    `<li><strong>Usuario:</strong> ${escapeHtml(input.username)}</li>`,
    `<li><strong>Contraseña:</strong> ${escapeHtml(input.password)}</li>`,
    '</ul>',
    `<p>Accede desde: <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>`,
    '<p>Gracias por confiar en Lucy3000.</p>'
  ].join('')

  const response = await sendResendEmail({ apiKey, from, to: recipient, subject, text, html })

  logInfo('Access credentials email delivered', {
    emailId: response.id || null,
    recipient,
    tenantCode: input.tenantCode
  })

  return { delivered: true, emailId: response.id, recipient }
}
