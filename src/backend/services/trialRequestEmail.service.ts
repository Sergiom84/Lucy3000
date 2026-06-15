import { logError, logInfo, logWarn } from '../utils/logger'
import type { CreateTrialRequestBody } from '../validators/trialRequest.schemas'

const DEFAULT_TRIAL_REQUEST_TO = 'sergiohernandezlara07@gmail.com'
const DEFAULT_TRIAL_REQUEST_FROM = 'Lucy3000 <onboarding@resend.dev>'

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
  recipient: string
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
  const ownerSubject = `Solicitud informacion Lucy3000 - ${input.name}`
  const ownerText = [
    'Nueva solicitud de version de prueba de Lucy3000.',
    '',
    `Nombre: ${input.name}`,
    `Email: ${input.email}`,
    'Prueba solicitada: 10 dias'
  ].join('\n')
  const ownerHtml = [
    '<h2>Nueva solicitud de version de prueba de Lucy3000</h2>',
    '<ul>',
    `<li><strong>Nombre:</strong> ${escapeHtml(input.name)}</li>`,
    `<li><strong>Email:</strong> ${escapeHtml(input.email)}</li>`,
    '<li><strong>Prueba solicitada:</strong> 10 dias</li>',
    '</ul>'
  ].join('')
  const requesterSubject = 'Hemos recibido tu solicitud de informacion de Lucy3000'
  const requesterText = [
    `Hola ${input.name},`,
    '',
    'Hemos recibido tu solicitud para probar Lucy3000 durante 10 dias.',
    'Sergio revisara tus datos y te enviara el ID cliente, usuario y contrasena cuando este todo listo.',
    '',
    'Resumen de tu solicitud:',
    `Nombre: ${input.name}`,
    `Email: ${input.email}`,
    '',
    'Gracias por tu interes en Lucy3000.'
  ].join('\n')
  const requesterHtml = [
    `<p>Hola ${escapeHtml(input.name)},</p>`,
    '<p>Hemos recibido tu solicitud para probar Lucy3000 durante 10 dias.</p>',
    '<p>Sergio revisara tus datos y te enviara el ID cliente, usuario y contrasena cuando este todo listo.</p>',
    '<h3>Resumen de tu solicitud</h3>',
    '<ul>',
    `<li><strong>Nombre:</strong> ${escapeHtml(input.name)}</li>`,
    `<li><strong>Email:</strong> ${escapeHtml(input.email)}</li>`,
    '</ul>',
    '<p>Gracias por tu interes en Lucy3000.</p>'
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

  void sendResendEmail({
      apiKey,
      from,
      to: input.email,
      replyTo: recipient,
      subject: requesterSubject,
      text: requesterText,
      html: requesterHtml
    })
    .then((requesterResponse) => {
      logInfo('Trial request requester copy delivered', {
        requesterEmailId: requesterResponse.id || null,
        requesterEmail: input.email
      })
    })
    .catch((error) => {
      const resendError = error as ResendEmailError
      logWarn('Trial request requester copy failed', {
        requesterEmail: input.email,
        status: resendError.status || null,
        responseBody: resendError.responseBody || null,
        message: resendError.message
      })
    })

  logInfo('Trial request owner email delivered', {
    copiedToRequester: false,
    ownerEmailId: ownerResponse.id || null,
    recipient,
    requesterEmail: input.email
  })

  return { copiedToRequester: false, delivered: true, recipient, requesterEmail: input.email }
}
