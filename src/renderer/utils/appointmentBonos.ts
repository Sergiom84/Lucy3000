import { getAppointmentServices } from './appointmentServices'
import {
  doesAppointmentMatchBonoService,
  type ComparableBonoTemplate
} from '../../shared/bonoServiceMatch'

type AppointmentBonoSession = {
  id?: string
  sessionNumber?: number | null
  status: 'AVAILABLE' | 'CONSUMED'
  appointmentId?: string | null
  consumedAt?: string | null
  appointment?: {
    id: string
  } | null
}

type AppointmentBonoPack = {
  id: string
  name: string
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED'
  serviceId?: string | null
  bonoTemplateId?: string | null
  service?: {
    id: string
    name: string
    category?: string | null
    serviceCode?: string | null
  } | null
  sessions: AppointmentBonoSession[]
}

type AppointmentLike = {
  id?: string | null
  serviceId?: string | null
  service?: {
    id: string
    name?: string | null
    category?: string | null
    serviceCode?: string | null
  } | null
  appointmentServices?: Array<{
    serviceId?: string | null
    sortOrder?: number | null
    service?: {
      id: string
      name?: string | null
      category?: string | null
      serviceCode?: string | null
    } | null
  }> | null
}

export type AppointmentBonoCandidate = {
  id: string
  name: string
  remainingSessions: number
  chargeableSessions: number
  serviceName: string | null
  isReservedForAppointment: boolean
  reservedSessionNumber: number | null
}

export type AppointmentConsumedBono = {
  id: string
  name: string
  sessionNumber: number | null
  sessionNumbers: number[]
  consumedAt: string | null
  consumedCount: number
}

const isLinkedToAppointment = (session: AppointmentBonoSession, appointmentId: string) =>
  session.appointmentId === appointmentId || session.appointment?.id === appointmentId

const resolveBonoPackComparableService = (
  bonoPack: AppointmentBonoPack,
  bonoTemplates: ComparableBonoTemplate[]
) => {
  const explicitTemplateId = String(bonoPack.bonoTemplateId || '').trim()
  const explicitTemplate =
    explicitTemplateId
      ? bonoTemplates.find((template) => String(template?.id || '').trim() === explicitTemplateId) || null
      : null

  return {
    id: explicitTemplate?.serviceId || bonoPack.serviceId || bonoPack.service?.id || null,
    name: explicitTemplate?.serviceName || bonoPack.service?.name || null,
    category: explicitTemplate?.category || bonoPack.service?.category || null,
    serviceCode: explicitTemplate?.serviceLookup || bonoPack.service?.serviceCode || null
  }
}

export const getRemainingBonoSessions = (bonoPack: AppointmentBonoPack) =>
  bonoPack.sessions.filter((session) => session.status === 'AVAILABLE').length

export const getConsumedAppointmentBono = (
  appointment: AppointmentLike | null | undefined,
  bonoPacks: AppointmentBonoPack[]
): AppointmentConsumedBono | null => {
  const appointmentId = String(appointment?.id || '').trim()
  if (!appointmentId) return null

  for (const bonoPack of bonoPacks) {
    const consumedSessions = bonoPack.sessions
      .filter((session) => session.status === 'CONSUMED' && isLinkedToAppointment(session, appointmentId))
      .sort((left, right) => (left.sessionNumber ?? 0) - (right.sessionNumber ?? 0))

    if (consumedSessions.length > 0) {
      const consumedSession = consumedSessions[0]
      return {
        id: bonoPack.id,
        name: bonoPack.name,
        sessionNumber: consumedSession.sessionNumber ?? null,
        sessionNumbers: consumedSessions
          .map((session) => session.sessionNumber)
          .filter((sessionNumber): sessionNumber is number => Number.isFinite(sessionNumber)),
        consumedAt: consumedSession.consumedAt || null,
        consumedCount: consumedSessions.length
      }
    }
  }

  return null
}

export const getAppointmentBonoCandidates = (
  appointment: AppointmentLike | null | undefined,
  bonoPacks: AppointmentBonoPack[],
  options: {
    bonoTemplates?: ComparableBonoTemplate[] | null
  } = {}
): AppointmentBonoCandidate[] => {
  const appointmentId = String(appointment?.id || '').trim()
  if (!appointmentId) return []
  const appointmentServices = getAppointmentServices(appointment || {})

  return bonoPacks
    .filter((bonoPack) => bonoPack.status === 'ACTIVE')
    .map((bonoPack) => {
      const linkedSessions = bonoPack.sessions.filter(
        (session) => session.status === 'AVAILABLE' && isLinkedToAppointment(session, appointmentId)
      )
      const freeAvailableSessions = bonoPack.sessions.filter(
        (session) => session.status === 'AVAILABLE' && !session.appointmentId
      )
      const comparableBonoService = resolveBonoPackComparableService(
        bonoPack,
        Array.isArray(options.bonoTemplates) ? options.bonoTemplates : []
      )
      const serviceMatches = doesAppointmentMatchBonoService(
        appointmentServices,
        comparableBonoService,
        {
          templates: options.bonoTemplates,
          allowGenericBono: false
        }
      )
      const chargeableSessions = serviceMatches ? linkedSessions.length + freeAvailableSessions.length : 0
      const canCharge = chargeableSessions > 0

      return {
        id: bonoPack.id,
        name: bonoPack.name,
        remainingSessions: getRemainingBonoSessions(bonoPack),
        chargeableSessions,
        serviceName: comparableBonoService.name || null,
        isReservedForAppointment: linkedSessions.length > 0,
        reservedSessionNumber: linkedSessions[0]?.sessionNumber ?? null,
        canCharge,
        serviceMatches
      }
    })
    .filter((bonoPack) => bonoPack.canCharge && bonoPack.remainingSessions > 0)
    .sort((left, right) => {
      if (left.isReservedForAppointment !== right.isReservedForAppointment) {
        return left.isReservedForAppointment ? -1 : 1
      }

      if (left.serviceMatches !== right.serviceMatches) {
        return left.serviceMatches ? -1 : 1
      }

      return left.name.localeCompare(right.name, 'es', { sensitivity: 'base' })
    })
    .map(({ canCharge: _canCharge, serviceMatches: _serviceMatches, ...bonoPack }) => bonoPack)
}
