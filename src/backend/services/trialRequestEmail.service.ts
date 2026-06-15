import { logError, logInfo, logWarn } from '../utils/logger'
import type { CreateTrialRequestBody } from '../validators/trialRequest.schemas'

const DEFAULT_TRIAL_REQUEST_TO = 'sergiohernandezlara07@gmail.com'
const DEFAULT_TRIAL_REQUEST_FROM = 'Lucy3000 <Info@sohl.dev>'

type ResendEmailResponse = {
  id?: string
  message?: string
  name?: string
}

type ResendEmailError = Error & {
  responseBody?: ResendEmailResponse
  status?: number
}

export type TrialRequestEmailResult = {
  copiedToRequester: boolean
  delivered: boolean
  ownerEmailId?: string
  recipient: string
  requesterEmailId?: string
  requesterEmail: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

export const getTrialRequestRecipient = () =>
  (process.env.TRIAL_REQUEST_TO || DEFAULT_TRIAL_REQUEST_TO).trim() || DEFAULT_TRIAL_REQUEST_TO

const sendResendEmail = async ({
  apiKey,
  from,
  html,
  replyTo,
  subject,
  text,
  to
}: {
  apiKey: string
  from: string
  html: string
  replyTo?: string
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
    body: JSON.stringify({
      from,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      html
    })
  })

  const responseBody = (await response.json().catch(() => ({}))) as ResendEmailResponse

  if (!response.ok) {
    const error = new Error(responseBody.message || 'Trial request email delivery failed') as ResendEmailError
    error.status = response.status
    error.responseBody = responseBody
    throw error
  }

  return responseBody
}

export const sendTrialRequestEmail = async (
  input: CreateTrialRequestBody
): Promise<TrialRequestEmailResult> => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const recipient = getTrialRequestRecipient()

  if (!apiKey) {
    logWarn('Trial request email provider is not configured', {
      recipient,
      requesterEmail: input.email,
      requesterName: input.name
    })

    return { copiedToRequester: false, delivered: false, recipient, requesterEmail: input.email }
  }

  const from = (process.env.TRIAL_REQUEST_FROM || DEFAULT_TRIAL_REQUEST_FROM).trim()
  const ownerSubject = `Solicitud información Lucy3000 - ${input.name}`
  const ownerText = [
    'Nueva solicitud de versión de prueba de Lucy3000.',
    '',
    `Nombre: ${input.name}`,
    `Email: ${input.email}`,
    `Teléfono: ${input.phone || '-'}`,
    'Prueba solicitada: 10 días'
  ].join('\n')
  const ownerHtml = [
    '<h2>Nueva solicitud de versión de prueba de Lucy3000</h2>',
    '<ul>',
    `<li><strong>Nombre:</strong> ${escapeHtml(input.name)}</li>`,
    `<li><strong>Email:</strong> ${escapeHtml(input.email)}</li>`,
    `<li><strong>Teléfono:</strong> ${escapeHtml(input.phone || '-')}</li>`,
    '<li><strong>Prueba solicitada:</strong> 10 días</li>',
    '</ul>'
  ].join('')
  const requesterSubject = 'Solicitud de prueba - Lucy3000'
  const requesterText = [
    `Hola ${input.name},`,
    '',
    'He recibido tu solicitud para probar Lucy3000.',
    'Te enviaré a éste correo electrónico el ID cliente, usuario y contraseña.',
    '',
    'Resumen de tu solicitud:',
    `Nombre: ${input.name}`,
    `Email: ${input.email}`,
    `Teléfono: ${input.phone || '-'}`,
    '',
    'Gracias por tu interés en Lucy3000.'
  ].join('\n')
  const requesterHtml = [
    `<p>Hola ${escapeHtml(input.name)},</p>`,
    '<p>He recibido tu solicitud para probar Lucy3000.</p>',
    '<p>Te enviaré a éste correo electrónico el ID cliente, usuario y contraseña.</p>',
    '<h3>Resumen de tu solicitud</h3>',
    '<ul>',
    `<li><strong>Nombre:</strong> ${escapeHtml(input.name)}</li>`,
    `<li><strong>Email:</strong> ${escapeHtml(input.email)}</li>`,
    `<li><strong>Teléfono:</strong> ${escapeHtml(input.phone || '-')}</li>`,
    '</ul>',
    '<p>Gracias por tu interés en Lucy3000.</p>'
  ].join('')

  const ownerResponse = await sendResendEmail({
    apiKey,
    from,
    to: recipient,
    replyTo: input.email,
    subject: ownerSubject,
    text: ownerText,
    html: ownerHtml
  })

  const requesterResponse = await sendResendEmail({
      apiKey,
      from,
      to: input.email,
      replyTo: recipient,
      subject: requesterSubject,
      text: requesterText,
      html: requesterHtml
    })

  logInfo('Trial request requester copy delivered', {
    requesterEmailId: requesterResponse.id || null,
    requesterEmail: input.email
  })

  logInfo('Trial request owner email delivered', {
    copiedToRequester: true,
    ownerEmailId: ownerResponse.id || null,
    recipient,
    requesterEmail: input.email
  })

  return {
    copiedToRequester: true,
    delivered: true,
    ownerEmailId: ownerResponse.id,
    recipient,
    requesterEmail: input.email,
    requesterEmailId: requesterResponse.id
  }
}
