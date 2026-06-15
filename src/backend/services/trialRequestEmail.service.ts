import { logError, logInfo, logWarn } from '../utils/logger'
import type { CreateTrialRequestBody } from '../validators/trialRequest.schemas'

const DEFAULT_TRIAL_REQUEST_TO = 'sergiohernandezlara07@gmail.com'
const DEFAULT_TRIAL_REQUEST_FROM = 'Lucy3000 <onboarding@resend.dev>'

type ResendEmailResponse = {
  id?: string
  message?: string
  name?: string
}

export type TrialRequestEmailResult = {
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
    throw new Error(responseBody.message || 'Trial request email delivery failed')
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

    return { delivered: false, recipient, requesterEmail: input.email }
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

  try {
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

    logInfo('Trial request emails delivered', {
      ownerEmailId: ownerResponse.id || null,
      requesterEmailId: requesterResponse.id || null,
      recipient,
      requesterEmail: input.email
    })

    return { delivered: true, recipient, requesterEmail: input.email }
  } catch (error) {
    logError('Trial request email delivery failed', undefined, {
      recipient,
      requesterEmail: input.email
    })
    throw error
  }
}
